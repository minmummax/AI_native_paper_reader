use tauri_plugin_sql::{Migration, MigrationKind};

/// Registers ordered, transactional SQLite migrations before the UI opens the database.
/// The SQL plugin resolves the database under the OS application config directory.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_local_reader_schema",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }];
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:paper-reader.db", migrations)
            .build())
        .run(tauri::generate_context!())
        .expect("Failed to start the local paper reader");
}
