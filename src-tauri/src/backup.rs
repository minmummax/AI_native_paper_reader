use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Connection, Row, SqliteConnection};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

const TABLES: &[&str] = &[
    "papers",
    "tags",
    "collections",
    "annotations",
    "notes",
    "paper_tags",
    "paper_collections",
    "app_settings",
    "parse_cache",
];
#[derive(Serialize, Deserialize)]
pub struct Manifest {
    version: u32,
    pub drafts: serde_json::Value,
}

async fn connect(path: &Path, readonly: bool) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .read_only(readonly)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(15)),
    )
    .await
    .map_err(|e| e.to_string())
}
fn regular(path: &Path) -> Result<(), String> {
    if !fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_file()
    {
        return Err("备份包含非普通文件".into());
    }
    Ok(())
}
fn valid_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
async fn ids(db: &mut SqliteConnection) -> Result<Vec<String>, String> {
    let values = sqlx::query_scalar::<_, String>("SELECT id FROM papers")
        .fetch_all(db)
        .await
        .map_err(|e| e.to_string())?;
    if values.iter().any(|id| !valid_id(id)) {
        return Err("备份含无效论文 ID".into());
    }
    Ok(values)
}
async fn copy_files(source: PathBuf, destination: PathBuf, ids: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
        for id in ids {
            let file = source.join(format!("{id}.pdf"));
            regular(&file)?;
            let imported = crate::files::copy_pdf(&file, &destination)?;
            if imported.id != id {
                return Err(format!("PDF 校验失败：{id}"));
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
async fn snapshot(
    database: &Path,
    papers: &Path,
    parent: &Path,
    drafts: serde_json::Value,
) -> Result<PathBuf, String> {
    let folder = parent.join(format!("paper-reader-backup-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let result = async {
        let mut db = connect(database, false).await?;
        sqlx::query("VACUUM INTO ?")
            .bind(folder.join("library.sqlite").to_string_lossy().as_ref())
            .execute(&mut db)
            .await
            .map_err(|e| e.to_string())?;
        let mut snapshot = connect(&folder.join("library.sqlite"), true).await?;
        let papers_ids = ids(&mut snapshot).await?;
        copy_files(papers.to_path_buf(), folder.join("papers"), papers_ids).await?;
        fs::write(
            folder.join("manifest.json"),
            serde_json::to_vec(&Manifest { version: 1, drafts }).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    }
    .await;
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&folder);
        return Err(error);
    }
    Ok(folder)
}
fn manifest(folder: &Path) -> Result<Manifest, String> {
    let path = folder.join("manifest.json");
    regular(&path)?;
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 {
        return Err("备份清单过大".into());
    }
    let value: Manifest = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if value.version != 1 || !value.drafts.is_object() {
        return Err("不支持的备份版本".into());
    }
    Ok(value)
}
/// Reads the selected backup manifest without changing current library data.
#[tauri::command]
pub async fn inspect_backup(folder: String) -> Result<Manifest, String> {
    tauri::async_runtime::spawn_blocking(move || manifest(Path::new(&folder)))
        .await
        .map_err(|e| e.to_string())?
}
/// Creates a consistent SQLite snapshot and verified managed PDF copies in a new child folder.
#[tauri::command]
pub async fn create_backup(
    app: tauri::AppHandle,
    folder: String,
    drafts: serde_json::Value,
) -> Result<String, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    snapshot(
        &config.join("paper-reader.db"),
        &data.join("papers"),
        Path::new(&folder),
        drafts,
    )
    .await
    .map(|path| path.to_string_lossy().into_owned())
}
async fn restore(database: &Path, papers: &Path, folder: &Path) -> Result<(), String> {
    regular(&folder.join("library.sqlite"))?;
    let mut source = connect(&folder.join("library.sqlite"), true).await?;
    let check: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut source)
        .await
        .map_err(|e| e.to_string())?;
    if check != "ok" {
        return Err("备份数据库完整性校验失败".into());
    }
    if !sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&mut source)
        .await
        .map_err(|e| e.to_string())?
        .is_empty()
    {
        return Err("备份存在失效关联".into());
    }
    let paper_ids = ids(&mut source).await?;
    let mut db = connect(database, false).await?;
    // Compare columns before touching current rows; migration history itself is never restored.
    let mut columns = Vec::new();
    for table in TABLES {
        let query = format!("PRAGMA table_info({table})");
        let current = sqlx::query(&query)
            .fetch_all(&mut db)
            .await
            .map_err(|e| e.to_string())?;
        let incoming = sqlx::query(&query)
            .fetch_all(&mut source)
            .await
            .map_err(|e| e.to_string())?;
        let names: Vec<String> = current.iter().map(|row| row.get("name")).collect();
        let incoming_names: Vec<String> = incoming.iter().map(|row| row.get("name")).collect();
        if names.is_empty() || names != incoming_names {
            return Err(format!("备份数据库版本不兼容：{table}"));
        }
        columns.push(
            names
                .iter()
                .map(|name| format!("\"{}\"", name.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    // Validate copies in an isolated staging folder before moving content-addressed files into storage.
    let stage = papers
        .parent()
        .ok_or("无效存储目录")?
        .join(format!("restore-stage-{}", uuid::Uuid::new_v4()));
    let copied = copy_files(folder.join("papers"), stage.clone(), paper_ids.clone()).await;
    if let Err(error) = copied {
        let _ = fs::remove_dir_all(&stage);
        return Err(error);
    }
    let installed = copy_files(stage.clone(), papers.to_path_buf(), paper_ids.clone()).await;
    let _ = fs::remove_dir_all(&stage);
    installed?;
    sqlx::query("ATTACH DATABASE ? AS recovery")
        .bind(folder.join("library.sqlite").to_string_lossy().as_ref())
        .execute(&mut db)
        .await
        .map_err(|e| e.to_string())?;
    let mut transaction = db.begin().await.map_err(|e| e.to_string())?;
    for table in TABLES.iter().rev() {
        sqlx::query(&format!("DELETE FROM main.{table}"))
            .execute(&mut *transaction)
            .await
            .map_err(|e| e.to_string())?;
    }
    for (table, fields) in TABLES.iter().zip(columns.iter()) {
        sqlx::query(&format!(
            "INSERT INTO main.{table} ({fields}) SELECT {fields} FROM recovery.{table}"
        ))
        .execute(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;
    }
    for id in paper_ids {
        sqlx::query("UPDATE papers SET file_path=? WHERE id=?")
            .bind(papers.join(format!("{id}.pdf")).to_string_lossy().as_ref())
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(|e| e.to_string())?;
    }
    transaction.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
/// Saves a recovery copy of current data, validates the selected backup and replaces library rows transactionally.
#[tauri::command]
pub async fn restore_backup(
    app: tauri::AppHandle,
    folder: String,
    drafts: serde_json::Value,
) -> Result<String, String> {
    manifest(Path::new(&folder))?;
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let database = config.join("paper-reader.db");
    let papers = data.join("papers");
    let recovery = snapshot(&database, &papers, &data.join("recovery"), drafts).await?;
    restore(&database, &papers, Path::new(&folder))
        .await
        .map_err(|error| format!("{error}；恢复前备份：{}", recovery.display()))?;
    Ok(recovery.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_restore_round_trip_and_reject_corrupt_pdf() {
        tauri::async_runtime::block_on(async {
            let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&root).unwrap();
            let database = root.join("live.sqlite");
            let mut db = SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(&database)
                    .create_if_missing(true)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
            for migration in [
                include_str!("../migrations/0001_initial.sql"),
                include_str!("../migrations/0002_collections.sql"),
                include_str!("../migrations/0003_paper_names.sql"),
            ] {
                sqlx::raw_sql(migration).execute(&mut db).await.unwrap();
            }
            let source = root.join("source.pdf");
            fs::write(&source, b"%PDF-1.7\nbackup fixture").unwrap();
            let papers = root.join("papers");
            let imported = crate::files::copy_pdf(&source, &papers).unwrap();
            sqlx::query("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES (?, '原始论文', 'old-computer-path', 24, 3)").bind(&imported.id).execute(&mut db).await.unwrap();
            sqlx::query("INSERT INTO notes(id,paper_id,page_number,content_markdown) VALUES ('note',?,2,'测试笔记')").bind(&imported.id).execute(&mut db).await.unwrap();
            let folder = snapshot(
                &database,
                &papers,
                &root.join("backups"),
                serde_json::json!({}),
            )
            .await
            .unwrap();
            sqlx::query("UPDATE papers SET title='changed'")
                .execute(&mut db)
                .await
                .unwrap();
            restore(&database, &papers, &folder).await.unwrap();
            let title: String = sqlx::query_scalar("SELECT title FROM papers")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(title, "原始论文");
            let path: String = sqlx::query_scalar("SELECT file_path FROM papers")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(
                Path::new(&path),
                papers.join(format!("{}.pdf", imported.id))
            );
            let note: String = sqlx::query_scalar("SELECT content_markdown FROM notes")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(note, "测试笔记");
            sqlx::query("UPDATE papers SET title='preserve me'")
                .execute(&mut db)
                .await
                .unwrap();
            sqlx::query("CREATE TRIGGER reject_restore BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'test failure'); END").execute(&mut db).await.unwrap();
            assert!(restore(&database, &papers, &folder).await.is_err());
            let untouched: String = sqlx::query_scalar("SELECT title FROM papers")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(untouched, "preserve me");
            sqlx::query("DROP TRIGGER reject_restore")
                .execute(&mut db)
                .await
                .unwrap();
            fs::write(
                folder.join("papers").join(format!("{}.pdf", imported.id)),
                b"%PDF-1.7\ncorrupt content",
            )
            .unwrap();
            assert!(restore(&database, &papers, &folder).await.is_err());
            let title: String = sqlx::query_scalar("SELECT title FROM papers")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(title, "preserve me");
            db.close().await.unwrap();
            fs::remove_dir_all(root).unwrap();
        });
    }
}
