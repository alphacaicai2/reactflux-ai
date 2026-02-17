/**
 * AI Provider configuration presets
 * Contains default API URLs for each supported provider
 */
export const PROVIDER_PRESETS = {
  openai: {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  anthropic: {
    name: 'Anthropic',
    apiUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  },
  zhipu: {
    name: '智谱（国内）',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-0520', 'glm-4-air', 'glm-4-airx', 'glm-4-flash']
  },
  zhipu_intl: {
    name: '智谱（国外）',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-0520', 'glm-4-air', 'glm-4-airx', 'glm-4-flash']
  },
  minimax: {
    name: 'Minimax（国内）',
    apiUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: ['abab6.5s-chat', 'abab6.5g-chat', 'abab6.5t-chat', 'abab5.5-chat']
  },
  minimax_intl: {
    name: 'Minimax（国外）',
    apiUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: ['abab6.5s-chat', 'abab6.5g-chat', 'abab6.5t-chat', 'abab5.5-chat']
  },
  google: {
    name: 'Google',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro']
  },
  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner']
  },
  moonshot: {
    name: '月之暗面',
    apiUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  openrouter: {
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
    models: ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'openai/gpt-4o', 'google/gemini-pro-1.5']
  },
  siliconflow: {
    name: '硅基流动',
    apiUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: ['Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-32B-Instruct', 'deepseek-ai/DeepSeek-V2.5']
  },
  custom: {
    name: '自定义',
    apiUrl: '',
    defaultModel: '',
    models: []
  }
};

/**
 * Get provider preset by provider ID
 * @param {string} providerId - The provider ID
 * @returns {object|null} - Provider preset or null if not found
 */
export function getProviderPreset(providerId) {
  return PROVIDER_PRESETS[providerId] || null;
}

/**
 * Get all provider presets
 * @returns {object} - All provider presets
 */
export function getAllProviderPresets() {
  return PROVIDER_PRESETS;
}

/**
 * Get list of providers for UI display
 * @returns {Array} - Array of provider info objects
 */
export function getProviderList() {
  return Object.entries(PROVIDER_PRESETS).map(([id, config]) => ({
    id,
    name: config.name,
    apiUrl: config.apiUrl,
    defaultModel: config.defaultModel,
    models: config.models
  }));
}

/**
 * Validate provider configuration
 * @param {string} provider - Provider ID
 * @param {object} config - Configuration object
 * @returns {object} - Validation result { valid: boolean, errors: string[] }
 */
export function validateProviderConfig(provider, config) {
  const errors = [];

  if (!provider) {
    errors.push('Provider is required');
  } else if (!PROVIDER_PRESETS[provider]) {
    errors.push(`Unknown provider: ${provider}`);
  }

  if (!config.apiUrl) {
    errors.push('API URL is required');
  }

  if (!config.apiKey) {
    errors.push('API Key is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  PROVIDER_PRESETS,
  getProviderPreset,
  getAllProviderPresets,
  getProviderList,
  validateProviderConfig
};
