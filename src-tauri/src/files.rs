use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::Manager;

const MAX_BYTES: u64 = 250 * 1024 * 1024;

#[derive(Serialize)]
pub struct ImportedFile {
    pub(crate) id: String,
    file_path: String,
    file_size: u64,
    name: String,
    source_name: String,
}

/// Streams a PDF into managed storage while hashing, without blocking the UI thread.
/// Content-addressed storage preserves references even if the source moves or disappears.
pub(crate) fn copy_pdf(source: &Path, directory: &Path) -> Result<ImportedFile, String> {
    let mut input = File::open(source).map_err(|e| format!("无法打开文件：{e}"))?;
    let metadata = input.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("仅支持不超过 250 MB 的 PDF 文件".into());
    }
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let temporary = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut output = File::create(&temporary).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        let mut size = 0_u64;
        loop {
            let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            if size == 0
                && !buffer[..count]
                    .windows(5)
                    .take(1024)
                    .any(|part| part == b"%PDF-")
            {
                return Err("文件不是有效的 PDF".into());
            }
            size += count as u64;
            if size > MAX_BYTES {
                return Err("PDF 超过 250 MB".into());
            }
            hash.update(&buffer[..count]);
            output
                .write_all(&buffer[..count])
                .map_err(|e| e.to_string())?;
        }
        if size == 0 {
            return Err("PDF 文件为空".into());
        }
        output.sync_all().map_err(|e| e.to_string())?;
        drop(output);
        let id = format!("{:x}", hash.finalize());
        let destination = directory.join(format!("{id}.pdf"));
        if !destination.exists() {
            fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
        }
        Ok(ImportedFile {
            id,
            file_path: destination.to_string_lossy().into_owned(),
            file_size: size,
            source_name: source
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            name: source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        })
    })();
    let _ = fs::remove_file(&temporary);
    result
}

/// Accepts a user-selected local path and prepares a content-addressed local PDF copy.
#[tauri::command]
pub async fn prepare_import(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<ImportedFile, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("papers");
    tauri::async_runtime::spawn_blocking(move || copy_pdf(Path::new(&file_path), &directory))
        .await
        .map_err(|e| e.to_string())?
}

/// Reads only managed PDFs addressed by a SHA-256 ID; arbitrary paths are not accepted.
#[tauri::command]
pub async fn read_paper_file(
    app: tauri::AppHandle,
    id: String,
) -> Result<tauri::ipc::Response, String> {
    if id.len() != 64 || !id.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("无效的论文 ID".into());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("papers")
        .join(format!("{id}.pdf"));
    let bytes = tauri::async_runtime::spawn_blocking(move || fs::read(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("本地 PDF 不可用：{e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn collect_pdfs(root: &Path) -> Result<Vec<String>, String> {
    let mut pending = vec![PathBuf::from(root)];
    let mut files = Vec::new();
    let mut visited = 0;
    while let Some(directory) = pending.pop() {
        visited += 1;
        if visited > 10000 {
            return Err("目录过大，请选择较小的文件夹".into());
        }
        for entry in fs::read_dir(directory).map_err(|e| format!("扫描目录失败：{e}"))? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                continue;
            }
            let path = entry.path();
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file()
                && path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
            {
                files.push(path.to_string_lossy().into_owned());
                if files.len() > 2000 {
                    return Err("一次最多扫描 2000 份 PDF，请选择更小的文件夹".into());
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

/// Recursively lists PDFs in a user-chosen directory, skipping symlinks to avoid cycles.
#[tauri::command]
pub async fn scan_folder(folder_path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || collect_pdfs(Path::new(&folder_path)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn importing_is_content_addressed_and_rejects_non_pdf() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let source = root.join("paper.pdf");
        fs::write(&source, b"%PDF-1.7\nfixture").unwrap();
        let store = root.join("storage");
        let first = copy_pdf(&source, &store).unwrap();
        let second = copy_pdf(&source, &store).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(fs::read_dir(&store).unwrap().count(), 1);
        fs::write(&source, b"not a pdf").unwrap();
        assert!(copy_pdf(&source, &store).is_err());
        assert_eq!(fs::read_dir(&store).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn scanning_includes_nested_uppercase_pdf() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("paper.PDF"), b"%PDF-").unwrap();
        fs::write(root.join("notes.txt"), b"text").unwrap();
        assert_eq!(collect_pdfs(&root).unwrap().len(), 1);
        fs::remove_dir_all(root).unwrap();
    }
}
