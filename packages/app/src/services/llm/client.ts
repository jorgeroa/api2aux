/**
 * LLM API client for chat. Calls OpenRouter (OpenAI-compatible) directly from browser.
 * OpenRouter supports CORS, so no backend proxy needed for the initial version.
 */

import { executeRaw, ApiInvokeError } from 'api-invoke'
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

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
  }

  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  try {
    const result = await executeRaw(`${baseUrl}/chat/completions`, {
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
      timeoutMs: 30000,
    })

    return result.data as LLMResponse
  } catch (error) {
    if (error instanceof ApiInvokeError) {
      throw new Error(`LLM API error (${error.status ?? 'unknown'}): ${error.message}`)
    }
    throw error
  }
}

/** Default models for each provider */
export const DEFAULT_MODELS: Record<ChatConfig['provider'], string> = {
  openrouter: 'anthropic/claude-haiku',
  openai: 'gpt-4o-mini',
  anthropic: 'anthropic/claude-haiku',
}
