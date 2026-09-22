import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

/** Renders accessible window controls only when native decorations are disabled. */
export function WindowControls() {
  const [frameless, setFrameless] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void getCurrentWindow().isDecorated().then(decorated => {
      if (active) setFrameless(!decorated);
    }).catch((reason: unknown) => {
      if (active) setError(String(reason));
    });
    return () => { active = false; };
  }, []);
  const run = (action: 'minimize' | 'toggleMaximize' | 'close'): void => {
    setError(null);
    void getCurrentWindow()[action]().catch((reason: unknown) => setError(String(reason)));
  };
  return <>
    {error && <span role="alert" className="max-w-48 truncate text-xs text-red-700" title={error}>窗口操作失败：{error}</span>}
    {frameless && <div className="flex shrink-0 items-center border-l border-stone-200 pl-2" aria-label="窗口控制">
      <button className="icon-button" aria-label="最小化窗口" onClick={() => run('minimize')}><Minus size={15} /></button>
      <button className="icon-button" aria-label="最大化或还原窗口" onClick={() => run('toggleMaximize')}><Square size={13} /></button>
      <button className="icon-button hover:bg-red-100 hover:text-red-700" aria-label="关闭窗口" onClick={() => run('close')}><X size={16} /></button>
    </div>}
  </>;
}
