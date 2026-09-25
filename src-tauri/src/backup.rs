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
        let has_usage: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_usage'",
        )
        .fetch_one(&mut snapshot)
        .await
        .map_err(|e| e.to_string())?;
        let has_records: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_records'",
        )
        .fetch_one(&mut snapshot)
        .await
        .map_err(|e| e.to_string())?;
        let papers_ids = ids(&mut snapshot).await?;
        copy_files(papers.to_path_buf(), folder.join("papers"), papers_ids).await?;
        fs::write(
            folder.join("manifest.json"),
            serde_json::to_vec(&Manifest {
                version: if has_records > 0 {
                    3
                } else if has_usage > 0 {
                    2
                } else {
                    1
                },
                drafts,
            })
            .map_err(|e| e.to_string())?,
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
    if ![1, 2, 3].contains(&value.version) || !value.drafts.is_object() {
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
    // Usage is an append-only local ledger: merge backups by request ID, never erase newer use.
    // Phase 1 backups have no ledger and must remain restorable without modifying current usage.
    let incoming_usage = sqlx::query("PRAGMA table_info(ai_usage)")
        .fetch_all(&mut source)
        .await
        .map_err(|e| e.to_string())?;
    let has_usage = !incoming_usage.is_empty();
    if has_usage {
        let current_usage = sqlx::query("PRAGMA table_info(ai_usage)")
            .fetch_all(&mut db)
            .await
            .map_err(|e| e.to_string())?;
        let names = |rows: &[sqlx::sqlite::SqliteRow]| {
            rows.iter()
                .map(|row| row.get::<String, _>("name"))
                .collect::<Vec<_>>()
        };
        if names(&incoming_usage) != names(&current_usage) {
            return Err("备份数据库版本不兼容：ai_usage".into());
        }
    }
    let incoming_records = sqlx::query("PRAGMA table_info(ai_records)")
        .fetch_all(&mut source)
        .await
        .map_err(|e| e.to_string())?;
    let has_records = !incoming_records.is_empty();
    if has_records {
        let current_records = sqlx::query("PRAGMA table_info(ai_records)")
            .fetch_all(&mut db)
            .await
            .map_err(|e| e.to_string())?;
        let names = |rows: &[sqlx::sqlite::SqliteRow]| {
            rows.iter()
                .map(|row| row.get::<String, _>("name"))
                .collect::<Vec<_>>()
        };
        if names(&incoming_records) != names(&current_records) {
            return Err("备份数据库版本不兼容：ai_records".into());
        }
    }
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
    // Paper deletion cascades to old selection records; older backups intentionally restore an empty history.
    if has_records {
        sqlx::query("INSERT INTO main.ai_records SELECT * FROM recovery.ai_records")
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
    if has_usage {
        sqlx::query("INSERT INTO main.ai_usage SELECT * FROM recovery.ai_usage WHERE true
            ON CONFLICT(request_id) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at,
            input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens
            WHERE ai_usage.status='pending' AND excluded.status!='pending'")
            .execute(&mut *transaction).await.map_err(|e|e.to_string())?;
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
                include_str!("../migrations/0004_ai_usage.sql"),
                include_str!("../migrations/0005_ai_records.sql"),
            ] {
                sqlx::raw_sql(migration).execute(&mut db).await.unwrap();
            }
            let source = root.join("source.pdf");
            fs::write(&source, b"%PDF-1.7\nbackup fixture").unwrap();
            let papers = root.join("papers");
            let imported = crate::files::copy_pdf(&source, &papers).unwrap();
            sqlx::query("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES (?, '原始论文', 'old-computer-path', 24, 3)").bind(&imported.id).execute(&mut db).await.unwrap();
            sqlx::query("INSERT INTO notes(id,paper_id,page_number,content_markdown) VALUES ('note',?,2,'测试笔记')").bind(&imported.id).execute(&mut db).await.unwrap();
            sqlx::query("INSERT INTO ai_usage(request_id,provider,model,status,input_tokens,output_tokens) VALUES ('usage','DeepSeek','test','succeeded',100,20)").execute(&mut db).await.unwrap();
            sqlx::query("INSERT INTO ai_records(id,paper_id,kind,model,selected_text,question,answer,sources_json,status,created_at) VALUES('translation',?,'translate','test','source','translate','保存的翻译','[]','succeeded','2026-09-25T00:00:00Z')").bind(&imported.id).execute(&mut db).await.unwrap();
            let folder = snapshot(
                &database,
                &papers,
                &root.join("backups"),
                serde_json::json!({}),
            )
            .await
            .unwrap();
            assert_eq!(manifest(&folder).unwrap().version, 3);
            sqlx::query("INSERT INTO ai_usage(request_id,provider,model,status) VALUES ('newer','DeepSeek','test','cancelled')").execute(&mut db).await.unwrap();
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
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT answer FROM ai_records WHERE id='translation'"
                )
                .fetch_one(&mut db)
                .await
                .unwrap(),
                "保存的翻译"
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ai_usage")
                    .fetch_one(&mut db)
                    .await
                    .unwrap(),
                2
            );
            // Simulate a Phase 1 backup; restoring it preserves today's usage and library notes.
            let mut old = connect(&folder.join("library.sqlite"), false)
                .await
                .unwrap();
            sqlx::query("DROP TABLE ai_records")
                .execute(&mut old)
                .await
                .unwrap();
            sqlx::query("DROP TABLE ai_usage")
                .execute(&mut old)
                .await
                .unwrap();
            old.close().await.unwrap();
            fs::write(
                folder.join("manifest.json"),
                br#"{"version":1,"drafts":{}}"#,
            )
            .unwrap();
            assert_eq!(manifest(&folder).unwrap().version, 1);
            restore(&database, &papers, &folder).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ai_records")
                    .fetch_one(&mut db)
                    .await
                    .unwrap(),
                0
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ai_usage")
                    .fetch_one(&mut db)
                    .await
                    .unwrap(),
                2
            );
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
