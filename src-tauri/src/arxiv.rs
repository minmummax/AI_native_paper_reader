use regex::Regex;
use reqwest::{blocking::Client, redirect::Policy};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use url::Url;

const MAX_BYTES: u64 = 250 * 1024 * 1024;
type Active = Option<(String, Arc<AtomicBool>)>;
#[derive(Default)]
pub struct DownloadState {
    active: Arc<Mutex<Active>>,
}
#[derive(Clone, Serialize)]
struct Progress {
    request_id: String,
    downloaded: u64,
    total: Option<u64>,
    stage: &'static str,
}
struct Cleanup(PathBuf);
impl Drop for Cleanup {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
struct ActiveGuard(Arc<Mutex<Active>>);
impl Drop for ActiveGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.0.lock() {
            *active = None;
        }
    }
}

fn allowed_host(url: &Url) -> bool {
    let host_allowed = (matches!(
        url.host_str(),
        Some("arxiv.org" | "www.arxiv.org" | "export.arxiv.org" | "cn.arxiv.org")
    ) && url.scheme() == "https")
        || (url.host_str() == Some("xxx.itp.ac.cn") && url.scheme() == "http");
    host_allowed
        && url.username().is_empty()
        && url.password().is_none()
        && ((url.scheme() == "https" && url.port_or_known_default() == Some(443))
            || (url.scheme() == "http" && url.port_or_known_default() == Some(80)))
}
/// Converts an arXiv abstract/PDF/HTML URL or identifier to a canonical identifier without making a request.
fn identifier(input: &str) -> Result<String, String> {
    let input = input.trim();
    if input.len() > 2048 {
        return Err("链接过长".into());
    }
    let raw = if input.starts_with("http://") || input.starts_with("https://") {
        let mut url = Url::parse(input).map_err(|_| "arXiv 链接无效")?;
        if url.scheme() == "http" && url.host_str() != Some("xxx.itp.ac.cn") {
            url.set_scheme("https").map_err(|_| "链接协议无效")?;
        }
        if !allowed_host(&url) {
            return Err("请输入 arXiv 官方或已配置的国内镜像链接".into());
        }
        let path = url.path();
        path.strip_prefix("/abs/")
            .or_else(|| path.strip_prefix("/pdf/"))
            .or_else(|| path.strip_prefix("/html/"))
            .ok_or("请输入 arXiv 论文摘要页、PDF 或 HTML 链接")?
            .trim_end_matches('/')
            .trim_end_matches(".pdf")
            .to_owned()
    } else {
        input
            .strip_prefix("arXiv:")
            .or_else(|| input.strip_prefix("arxiv:"))
            .unwrap_or(input)
            .to_owned()
    };
    let modern = Regex::new(r"^\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}(?:v[1-9]\d*)?$")
        .map_err(|e| e.to_string())?;
    let legacy =
        Regex::new(r"^[a-z][a-z-]*(?:\.[A-Z]{2})?/\d{2}(?:0[1-9]|1[0-2])\d{3}(?:v[1-9]\d*)?$")
            .map_err(|e| e.to_string())?;
    if !modern.is_match(&raw) && !legacy.is_match(&raw) {
        return Err("未识别到有效的 arXiv 编号，例如 1706.03762 或 hep-th/9901001".into());
    }
    Ok(raw)
}
fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("已取消下载".into())
    } else {
        Ok(())
    }
}
fn stream_pdf(
    mut source: impl Read,
    mut output: impl Write,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64),
) -> Result<u64, String> {
    let mut buffer = [0_u8; 64 * 1024];
    let mut size = 0_u64;
    loop {
        check_cancel(cancel)?;
        let count = source
            .read(&mut buffer)
            .map_err(|e| format!("下载中断：{e}"))?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > MAX_BYTES {
            return Err("PDF 超过 250 MB 限制".into());
        }
        output
            .write_all(&buffer[..count])
            .map_err(|e| format!("无法保存下载文件：{e}"))?;
        progress(size);
    }
    check_cancel(cancel)?;
    if size == 0 {
        return Err("arXiv 返回了空文件".into());
    }
    Ok(size)
}
fn download(
    input: &str,
    directory: &Path,
    cancel: &AtomicBool,
    emit: impl Fn(u64, Option<u64>, &'static str),
) -> Result<crate::files::ImportedFile, String> {
    let id = identifier(input)?;
    check_cancel(cancel)?;
    let client = Client::builder()
        .user_agent("LocalPaperReader/0.1.1 (user-initiated PDF download)")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !allowed_host(attempt.url()) {
                attempt.error("不允许的下载重定向")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("无法建立 HTTPS 连接：{e}"))?;
    emit(0, None, "connecting");
    let candidates = [
        format!("http://xxx.itp.ac.cn/pdf/{id}.pdf"),
        format!("https://export.arxiv.org/pdf/{id}"),
        format!("https://cn.arxiv.org/pdf/{id}"),
        format!("https://arxiv.org/pdf/{id}"),
    ];
    let mut response = None;
    let mut last_error = String::new();
    for candidate in candidates {
        match client.get(candidate).send() {
            Ok(value) if value.status().is_success() => {
                response = Some(value);
                break;
            }
            Ok(value) => last_error = format!("HTTP {}", value.status()),
            Err(error) => last_error = error.to_string(),
        }
    }
    let response = response.ok_or_else(|| format!("所有 arXiv 下载节点均失败：{last_error}"))?;
    check_cancel(cancel)?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("未找到这篇 arXiv 论文，请检查链接或版本号".into()),
        429 => return Err("arXiv 暂时限制请求，请稍后再试".into()),
        status => return Err(format!("arXiv 下载失败（HTTP {status}）")),
    }
    let total = response.content_length();
    if total.is_some_and(|size| size > MAX_BYTES) {
        return Err("PDF 超过 250 MB 限制".into());
    }
    if response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.contains("text/html"))
    {
        return Err("arXiv 返回了网页而不是 PDF，请稍后重试".into());
    }
    let temp = directory
        .join("downloads")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let _cleanup = Cleanup(temp.clone());
    let path = temp.join(format!("arxiv-{}.pdf", id.replace('/', "-")));
    let mut output = fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut last = Instant::now();
    emit(0, total, "downloading");
    let size = stream_pdf(response, &mut output, cancel, |size| {
        if last.elapsed() >= Duration::from_millis(150) {
            emit(size, total, "downloading");
            last = Instant::now();
        }
    })?;
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    check_cancel(cancel)?;
    emit(size, total, "importing");
    crate::files::copy_pdf(&path, &directory.join("papers"))
}
/// Downloads only an explicitly selected arXiv PDF in a background worker and prepares the standard hashed local import.
#[tauri::command]
pub async fn download_arxiv(
    app: tauri::AppHandle,
    state: tauri::State<'_, DownloadState>,
    input: String,
    request_id: String,
) -> Result<crate::files::ImportedFile, String> {
    identifier(&input)?;
    uuid::Uuid::parse_str(&request_id).map_err(|_| "无效下载请求")?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("另一份论文正在下载，请稍候".into());
        }
        *active = Some((request_id.clone(), cancel.clone()));
    }
    let guard = ActiveGuard(state.active.clone());
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        download(&input, &directory, &cancel, |downloaded, total, stage| {
            let _ = app.emit(
                "arxiv-download-progress",
                Progress {
                    request_id: request_id.clone(),
                    downloaded,
                    total,
                    stage,
                },
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Cancels the active matching download; blocked network reads return on data arrival or the request timeout.
#[tauri::command]
pub fn cancel_arxiv_download(
    state: tauri::State<'_, DownloadState>,
    request_id: String,
) -> Result<(), String> {
    let active = state.active.lock().map_err(|e| e.to_string())?;
    if let Some((id, cancel)) = &*active {
        if id == &request_id {
            cancel.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_paper_links_and_versions() {
        for input in [
            "1706.03762v2",
            "arXiv:1706.03762v2",
            "https://arxiv.org/abs/1706.03762v2?utm_source=test#x",
            "http://www.arxiv.org/pdf/1706.03762v2.pdf",
            "https://arxiv.org/html/1706.03762v2",
        ] {
            assert_eq!(identifier(input).unwrap(), "1706.03762v2");
        }
        assert_eq!(
            identifier("https://arxiv.org/abs/hep-th/9901001v1").unwrap(),
            "hep-th/9901001v1"
        );
    }
    #[test]
    fn rejects_external_hosts_credentials_and_invalid_identifiers() {
        for input in [
            "https://arxiv.org.evil.example/pdf/1706.03762",
            "https://arxiv.org@evil.example/pdf/1706.03762",
            "https://user@arxiv.org/pdf/1706.03762",
            "https://arxiv.org:123/pdf/1706.03762",
            "https://arxiv.org/search",
            "../../notes",
            "1713.00001",
            "1706.03762v0",
            "file:///tmp/paper.pdf",
        ] {
            assert!(identifier(input).is_err(), "{input}");
        }
        assert!(allowed_host(
            &Url::parse("https://cn.arxiv.org/pdf/1706.03762").unwrap()
        ));
        assert!(!allowed_host(
            &Url::parse("https://example.com/file.pdf").unwrap()
        ));
        assert!(allowed_host(
            &Url::parse("http://xxx.itp.ac.cn/pdf/1706.03762.pdf").unwrap()
        ));
        assert!(!allowed_host(
            &Url::parse("http://arxiv.org/pdf/1706.03762").unwrap()
        ));
    }
    #[test]
    fn cancelled_and_empty_downloads_are_not_accepted() {
        let cancel = AtomicBool::new(true);
        let mut output = Vec::new();
        assert!(stream_pdf(&b"%PDF-fixture"[..], &mut output, &cancel, |_| {}).is_err());
        assert!(output.is_empty());
        cancel.store(false, Ordering::Relaxed);
        assert!(stream_pdf(&b""[..], &mut output, &cancel, |_| {}).is_err());
        assert_eq!(
            stream_pdf(&b"%PDF-fixture"[..], &mut output, &cancel, |_| {}).unwrap(),
            12
        );
    }
    #[test]
    #[ignore = "Explicit online smoke test; never part of offline regression tests"]
    fn online_download() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let _cleanup = Cleanup(root.clone());
        let result = download("1706.03762", &root, &AtomicBool::new(false), |_, _, _| {}).unwrap();
        assert_eq!(result.id.len(), 64);
    }
}
