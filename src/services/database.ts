import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

const DATABASE_URL = 'sqlite:paper-reader.db';
let pendingDatabase: Promise<Database> | undefined;

/**
 * Opens the local database once, applying registered Rust migrations before resolving.
 * The SQL plugin/SQLx SQLite pool enables foreign keys on each connection by default;
 * verify that invariant rather than relying on a PRAGMA set on just one pooled connection.
 * Failed initialization resets the shared promise so an explicit retry can succeed.
 * @returns Migrated desktop SQLite handle; rejects in browser-only preview.
 */
export function initializeDatabase(): Promise<Database> {
  if (!isTauri()) return Promise.reject(new Error('SQLite 仅在 Tauri 桌面应用中可用'));
  if (!pendingDatabase) {
    pendingDatabase = (async () => {
      const database = await Database.load(DATABASE_URL);
      try {
        const rows = await database.select<Array<{ foreign_keys: number }>>('PRAGMA foreign_keys');
        if (rows[0]?.foreign_keys !== 1) throw new Error('SQLite 外键约束未启用');
        return database;
      } catch (error: unknown) {
        await database.close().catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      pendingDatabase = undefined;
      throw error;
    });
  }
  return pendingDatabase;
}
