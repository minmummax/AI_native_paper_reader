mod files;

use tauri_plugin_sql::{Migration, MigrationKind};

/// Registers ordered, transactional SQLite migrations before the UI opens the database.
/// The SQL plugin resolves the database under the OS application config directory.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_local_reader_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "collections_and_library_indexes",
            sql: include_str!("../migrations/0002_collections.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "original_and_editable_paper_names",
            sql: include_str!("../migrations/0003_paper_names.sql"),
            kind: MigrationKind::Up,
        },
    ];
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            files::prepare_import,
            files::read_paper_file,
            files::scan_folder
        ])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:paper-reader.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("Failed to start the local paper reader");
}
