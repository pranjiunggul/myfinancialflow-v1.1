import type { AIProviderConfig } from '../types';

export const PRESET_AI_PROVIDERS: Omit<AIProviderConfig, 'createdAt' | 'updatedAt' | 'version'>[] = [
  {
    id: 'prov_deepseek',
    name: 'DeepSeek',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsEndpoint: '/models',
    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
    selectedModel: 'deepseek-chat',
    isEnabled: true,
  },
  {
    id: 'prov_openrouter',
    name: 'OpenRouter',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
    availableModels: [
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat',
      'google/gemini-2.0-flash-exp:free',
    ],
    selectedModel: 'anthropic/claude-3.5-sonnet',
    isEnabled: true,
  },
  {
    id: 'prov_gemini',
    name: 'Google Gemini',
    type: 'preset',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsEndpoint: '/models',
    availableModels: [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ],
    selectedModel: 'gemini-3.8-flash',
    isEnabled: true,
  },
  {
    id: 'prov_groq',
    name: 'Groq',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsEndpoint: '/models',
    availableModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    selectedModel: 'llama-3.3-70b-versatile',
    isEnabled: true,
  },
  {
    id: 'prov_anthropic',
    name: 'Anthropic (Claude)',
    type: 'preset',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsEndpoint: '/models',
    authHeaderFormat: 'x-api-key: {KEY}',
    availableModels: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    selectedModel: 'claude-3-5-sonnet-20241022',
    isEnabled: true,
  },
  {
    id: 'prov_openai',
    name: 'OpenAI',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
    availableModels: [
      'gpt-4o-mini',
      'gpt-4o',
      'o1-mini',
    ],
    selectedModel: 'gpt-4o-mini',
    isEnabled: true,
  },
  {
    id: 'prov_mistral',
    name: 'Mistral AI',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsEndpoint: '/models',
    availableModels: [
      'mistral-small-latest',
      'mistral-large-latest',
      'codestral-latest',
    ],
    selectedModel: 'mistral-small-latest',
    isEnabled: true,
  },
  {
    id: 'prov_ollama',
    name: 'Local Ollama',
    type: 'preset',
    protocol: 'ollama',
    baseUrl: 'http://localhost:11434',
    modelsEndpoint: '/api/tags',
    availableModels: ['llama3.2', 'qwen2.5', 'mistral'],
    selectedModel: 'llama3.2',
    isEnabled: true,
  },
];

export function createCustomProviderConfig(params: {
  name: string;
  baseUrl: string;
  authHeaderFormat?: string;
  modelsEndpoint?: string;
  defaultModel?: string;
}): AIProviderConfig {
  const now = Date.now();
  const id = 'prov_custom_' + crypto.randomUUID().slice(0, 8);
  return {
    id,
    name: params.name.trim() || 'Custom Provider',
    type: 'custom',
    protocol: 'openai_compatible',
    baseUrl: params.baseUrl.trim().replace(/\/+$/, ''),
    authHeaderFormat: params.authHeaderFormat?.trim() || 'Bearer {KEY}',
    modelsEndpoint: params.modelsEndpoint?.trim() || '/models',
    availableModels: params.defaultModel ? [params.defaultModel.trim()] : ['default'],
    selectedModel: params.defaultModel?.trim() || 'default',
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}
