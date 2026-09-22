import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { initializeDatabase } from '../services/database';

export type DatabaseStatus =
  | { state: 'loading' | 'ready' | 'preview'; message: string }
  | { state: 'error'; message: string };

/**
 * Initializes desktop persistence with unmount protection and explicit retry support.
 * @param attempt Increment to retry a failed initialization.
 * @returns Status used by the layout; browser preview never pretends to persist data.
 */
export function useDatabase(attempt: number): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>({ state: 'loading', message: '正在初始化本地数据库…' });
  useEffect(() => {
    if (!isTauri()) {
      setStatus({ state: 'preview', message: '浏览器布局预览 · SQLite 请在桌面端验证' });
      return;
    }
    let active = true;
    setStatus({ state: 'loading', message: '正在初始化本地数据库…' });
    void initializeDatabase().then(() => {
      if (active) setStatus({ state: 'ready', message: '本地 SQLite 已就绪 · 离线模式' });
    }).catch((error: unknown) => {
      if (active) setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => { active = false; };
  }, [attempt]);
  return status;
}
