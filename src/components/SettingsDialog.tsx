import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import type { AiProfile } from '../types/ai';
import { UsageReport } from './UsageReport';
import { presetForProfile, providerPresets } from '../lib/aiProviders';

interface Props { autoOpen: boolean; onAutoOpen: (value: boolean) => Promise<void>; onConfigured: () => void; onClose: () => void }

/** @param props Local preference callbacks. @returns Application settings, separate from paper conversations. */
export function SettingsDialog({ autoOpen, onAutoOpen, onConfigured, onClose }: Props) {
  const [tab, setTab] = useState<'model' | 'usage'>('model');
  const [profile, setProfile] = useState<AiProfile | null>(null);
  const [model, setModel] = useState('deepseek-flash');
  const [providerType, setProviderType] = useState<'deepseek' | 'custom'>('deepseek');
  const [presetId, setPresetId] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [requiresKey, setRequiresKey] = useState(true);
  const [includeUsage, setIncludeUsage] = useState(true);
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    dialog.current?.focus();
    void invoke<AiProfile>('get_ai_profile').then(value => { if (mounted.current) { setProfile(value); setPresetId(presetForProfile(value).id); setModel(value.model); setProviderType(value.providerType); setBaseUrl(value.baseUrl); setRequiresKey(value.requiresKey); setIncludeUsage(value.includeUsage); } })
      .catch((reason: unknown) => { if (mounted.current) setError(String(reason)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const save = async (removeKey = false): Promise<void> => {
    setSaving(true); setError(''); setMessage('');
    const entered = key.trim(); setKey('');
    try {
      const value = await invoke<AiProfile>('configure_ai_provider', { providerType, baseUrl: baseUrl.trim(), requiresKey, includeUsage, model: model.trim(), apiKey: removeKey ? null : entered || null, removeKey });
      onConfigured();
      if (mounted.current) { setProfile(value); setPresetId(presetForProfile(value).id); setModel(value.model); setProviderType(value.providerType); setBaseUrl(value.baseUrl); setRequiresKey(value.requiresKey); setIncludeUsage(value.includeUsage); setMessage(removeKey ? '已从系统凭据库删除密钥' : '模型配置已保存'); }
    } catch (reason: unknown) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setSaving(false); }
  };
  const sameEndpoint = profile?.providerType === providerType && profile.baseUrl === baseUrl.trim().replace(/\/$/, '');
  const savedKey = sameEndpoint && profile?.hasKey;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3 sm:p-6"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!saving) onClose(); }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="flex items-center justify-between border-b px-5 py-3"><h2 id="settings-title" className="font-semibold">应用设置</h2><button className="icon-button" aria-label="关闭设置" disabled={saving} onClick={onClose}><X size={18}/></button></header>
    <nav className="flex gap-2 border-b px-5 py-2" aria-label="设置分类"><button className={`small-button ${tab === 'model' ? 'bg-teal-50 text-teal-800' : ''}`} onClick={() => { setKey(''); setTab('model'); }} disabled={saving}>模型与对话</button><button className={`small-button ${tab === 'usage' ? 'bg-teal-50 text-teal-800' : ''}`} onClick={() => { setKey(''); setTab('usage'); }} disabled={saving}>用量统计</button></nav>
    <div className="min-h-0 overflow-auto p-5 sm:p-6">{tab === 'usage' ? <UsageReport/> : <div className="space-y-6">
      <section><h3 className="font-medium">悬浮对话</h3><label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={autoOpen} disabled={saving} onChange={event => { setError(''); const checked = event.target.checked; setSaving(true); void onAutoOpen(checked).catch((reason: unknown) => { if (mounted.current) setError(String(reason)); }).finally(() => { if (mounted.current) setSaving(false); }); }}/><span>打开论文时自动显示 AI 悬浮窗<span className="mt-1 block text-xs leading-5 text-slate-500">也可以随时点击右下角“AI 对话”。窗口可拖动、收起；只有点击发送才会调用模型。</span></span></label></section>
      <form className="space-y-4 border-t pt-5" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div><h3 className="font-medium">大模型配置</h3><p className="mt-1 text-xs text-slate-500">支持 DeepSeek、OpenRouter、智谱 GLM、小米 MiMo 及自定义兼容服务。每次使用一个服务，保存后生效。</p></div>
        {loading && <p role="status" className="text-xs">正在读取本地配置…</p>}
        <label className="block text-sm">服务类型<select className="mt-1 block w-full rounded-lg border p-2" value={presetId} disabled={saving || loading} onChange={event => {
          const preset = providerPresets.find(item => item.id === event.target.value);
          if (!preset) return;
          setPresetId(preset.id); setProviderType(preset.providerType); setKey(''); setMessage(''); setError('');
          const values = profile && presetForProfile(profile).id === preset.id ? profile : preset;
          setBaseUrl(values.baseUrl); setModel(values.model); setRequiresKey(values.requiresKey); setIncludeUsage(values.includeUsage);
        }}>{providerPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
        <p className="text-xs leading-5 text-slate-500">{providerPresets.find(preset => preset.id === presetId)?.hint}</p>
        {providerType === 'custom' && <>
          <label className="block text-sm">服务地址（Base URL）<input type="url" className="mt-1 block w-full rounded-lg border p-2" value={baseUrl} placeholder="http://127.0.0.1:8000/v1" disabled={saving || loading} readOnly={presetId !== 'custom'} required maxLength={2048} onChange={event => { setBaseUrl(event.target.value); setKey(''); }}/></label>
          <p className="text-xs leading-5 text-slate-500">只填主机和端口时自动补 /v1，也可填写完整 API 前缀或 /chat/completions 地址。HTTP 支持本机、私有 IP 和 .local 域名；局域网 HTTP 不加密传输内容。</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresKey} disabled={saving || loading} onChange={event => { setRequiresKey(event.target.checked); setKey(''); }}/>服务需要 API Key</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeUsage} disabled={saving || loading} onChange={event => setIncludeUsage(event.target.checked)}/>请求流式 token 用量（服务支持时开启）</label>
          <p className="text-xs text-slate-500">关闭用量请求可兼容更多服务；未返回的 token 数会显示未知，不影响请求次数统计。</p>
        </>}
        <label className="block text-sm">模型名称<input className="mt-1 block w-full rounded-lg border p-2" value={model} disabled={saving || loading} required maxLength={100} onChange={event => setModel(event.target.value)}/></label>
        {requiresKey && <label className="block text-sm">API Key {savedKey ? '（已保存，留空保留）' : ''}<input type="password" autoComplete="off" spellCheck={false} value={key} disabled={saving || loading} maxLength={4096} className="mt-1 block w-full rounded-lg border p-2" onChange={event => setKey(event.target.value)}/></label>}
        <p className="text-xs leading-5 text-slate-500">密钥只保存在系统凭据库，不进入数据库或备份。整篇对话保留在当前会话；选区翻译、选区问答和用量保存在本机，选区记录可在右侧删除。</p>
        <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={saving || loading || !isTauri()}>{saving ? '保存中…' : '保存模型配置'}</button>{savedKey && <button type="button" className="small-button" disabled={saving || loading} onClick={() => { void save(true); }}>删除已保存的密钥</button>}</div>
      </form>
      {message && <p role="status" className="text-sm text-teal-700">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>}</div>
  </section></div>;
}
