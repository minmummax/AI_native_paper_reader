import type { AiProfile } from '../types/ai';

export interface ProviderPreset {
  id: string;
  name: string;
  providerType: AiProfile['providerType'];
  baseUrl: string;
  model: string;
  requiresKey: boolean;
  includeUsage: boolean;
  hint: string;
}

export const providerPresets: readonly ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek 官方', providerType: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', requiresKey: true, includeUsage: true, hint: '填写 DeepSeek 平台的 API Key 和账户可用模型名称。' },
  { id: 'openrouter', name: 'OpenRouter', providerType: 'custom', baseUrl: 'https://openrouter.ai/api/v1', model: '', requiresKey: true, includeUsage: false, hint: '填写 OpenRouter API Key；模型使用平台完整 ID（通常为 厂商/模型）。请选支持文本聊天和流式响应的模型。' },
  { id: 'glm', name: '智谱 GLM（国内 API）', providerType: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: '', requiresKey: true, includeUsage: false, hint: '使用智谱开放平台的通用 API Key 和模型 ID。Coding Plan 与海外 Z.ai 地址不同，请通过自定义配置对应服务。' },
  { id: 'mimo', name: '小米 MiMo', providerType: 'custom', baseUrl: 'https://api.xiaomimimo.com/v1', model: '', requiresKey: true, includeUsage: false, hint: '使用小米 MiMo 通用 API Key 和模型 ID。当前适配文本聊天，关闭深度思考以优先返回阅读回答；不包含语音、工具调用或 Token Plan 专用入口。' },
  { id: 'custom', name: '自定义（OpenAI 兼容 / 私有部署）', providerType: 'custom', baseUrl: '', model: '', requiresKey: false, includeUsage: false, hint: '支持其他 OpenAI Chat Completions 兼容服务及本地模型；需支持 SSE 流式响应。' },
];

/** @param profile Saved connection settings. @returns Matching preset, preserving older custom configurations. */
export function presetForProfile(profile: Pick<AiProfile, 'providerType' | 'baseUrl'>): ProviderPreset {
  const base = profile.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return providerPresets.find(preset => preset.providerType === profile.providerType && preset.baseUrl === base)
    ?? providerPresets[providerPresets.length - 1]!;
}
