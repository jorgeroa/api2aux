/**
 * LLM API client for chat. Calls OpenAI-compatible endpoints from the browser.
 * OpenRouter supports CORS natively; other providers (OpenAI) are routed
 * through the Vite CORS proxy.
 */

import type { ChatMessage, Tool, LLMResponse, ChatConfig } from './types'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const OPENAI_BASE = 'https://api.openai.com/v1'

function getBaseUrl(provider: ChatConfig['provider']): string {
  switch (provider) {
    case 'openrouter': return OPENROUTER_BASE
    case 'openai': return OPENAI_BASE
    case 'anthropic': return OPENROUTER_BASE // Anthropic models via OpenRouter
  }
}

function proxyUrl(url: string): string {
  return `/api-proxy/${encodeURIComponent(url)}`
}

function needsProxy(provider: ChatConfig['provider']): boolean {
  // OpenRouter supports CORS natively; all other providers need the proxy
  return provider !== 'openrouter'
}

/**
 * Send a chat completion request with tool definitions.
 * Returns the assistant's response (may include tool_calls).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  tools: Tool[],
  config: ChatConfig,
): Promise<LLMResponse> {
  const baseUrl = getBaseUrl(config.provider)
  const endpoint = `${baseUrl}/chat/completions`
  const url = needsProxy(config.provider) ? proxyUrl(endpoint) : endpoint

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  }

  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...(config.provider === 'openrouter' ? {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'api2aux',
      } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errBody = await response.json()
      detail = errBody?.error?.message ?? JSON.stringify(errBody)
    } catch { /* use statusText */ }
    throw new Error(`LLM API error (${response.status}): ${detail}`)
  }

  return response.json() as Promise<LLMResponse>
}

/** Default models for each provider */
export const DEFAULT_MODELS: Record<ChatConfig['provider'], string> = {
  openrouter: 'anthropic/claude-haiku',
  openai: 'gpt-4o-mini',
  anthropic: 'anthropic/claude-haiku',
}
