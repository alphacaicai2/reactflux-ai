/**
 * AI Service Providers Configuration
 * Defines available AI providers with their default settings
 */

export const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    defaultUrl: "https://api.openai.com/v1",
    regions: null,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultUrl: "https://api.anthropic.com/v1",
    regions: null,
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    defaultUrl: "https://open.bigmodel.cn/api/paas/v4",
    regions: ["国内", "国外"],
    models: ["glm-4-plus", "glm-4-0520", "glm-4", "glm-4-air", "glm-4-airx", "glm-4-flash"],
  },
  {
    id: "minimax",
    name: "Minimax",
    defaultUrl: "https://api.minimax.chat/v1",
    regions: ["国内", "国外"],
    models: ["abab6.5s-chat", "abab6.5-chat", "abab5.5-chat", "abab5.5s-chat"],
  },
  {
    id: "google",
    name: "Google (Gemini)",
    defaultUrl: "https://generativelanguage.googleapis.com/v1beta",
    regions: null,
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultUrl: "https://api.deepseek.com/v1",
    regions: null,
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  },
  {
    id: "moonshot",
    name: "月之暗面",
    defaultUrl: "https://api.moonshot.cn/v1",
    regions: null,
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultUrl: "https://openrouter.ai/api/v1",
    regions: null,
    models: null, // OpenRouter supports many models dynamically
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    defaultUrl: "https://api.siliconflow.cn/v1",
    regions: null,
    models: [
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-32B-Instruct",
      "Qwen/Qwen2.5-14B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "deepseek-ai/DeepSeek-V2.5",
      "deepseek-ai/DeepSeek-Coder-V2-Instruct",
    ],
  },
  {
    id: "custom",
    name: "自定义",
    defaultUrl: "",
    regions: null,
    models: null,
  },
]

/**
 * Get provider by ID
 * @param {string} providerId - The provider ID
 * @returns {object|undefined} The provider configuration
 */
export const getProviderById = (providerId) => {
  return AI_PROVIDERS.find((provider) => provider.id === providerId)
}

/**
 * Get default URL for a provider
 * @param {string} providerId - The provider ID
 * @returns {string} The default URL
 */
export const getDefaultUrl = (providerId) => {
  const provider = getProviderById(providerId)
  return provider?.defaultUrl ?? ""
}

/**
 * Check if provider supports regions
 * @param {string} providerId - The provider ID
 * @returns {boolean} Whether the provider supports regions
 */
export const hasRegionalEndpoints = (providerId) => {
  const provider = getProviderById(providerId)
  return provider?.regions !== null
}

/**
 * Get region options for a provider
 * @param {string} providerId - The provider ID
 * @returns {string[]|null} The region options
 */
export const getRegionOptions = (providerId) => {
  const provider = getProviderById(providerId)
  return provider?.regions ?? null
}
