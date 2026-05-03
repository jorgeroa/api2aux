import { describe, it, expect, vi } from 'vitest'
import { ChatEngine } from '../../src/engine'
import { ChatEventType, FinishReason, MergeStrategy, MessageRole } from '../../src/types'
import type {
  ChatMessage,
  LLMCompletionFn,
  ToolExecutorFn,
  ChatEngineContext,
  ChatEngineEvent,
  ChatEngineEventHandler,
  StreamResult,
  Tool,
} from '../../src/types'

// Tests for ChatEngine.resumeWithToolResult — the continuation primitive used by the
// inline-login flow. The engine pushes a placeholder tool result during the original
// turn (so the LLM can acknowledge that a UI prompt is up); when the user submits, the
// frontend resolves the placeholder by calling resumeWithToolResult with the real data.
// These tests pin down the contract: history is rewritten in place, Phase B re-runs on
// the resolved data, and the LLM produces an answer grounded in the new data instead
// of the placeholder.

const tool: Tool = {
  type: 'function',
  function: {
    name: 'get_profile',
    description: 'Fetch the signed-in user profile',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const ctx: ChatEngineContext = {
  url: 'https://api.example.com',
  spec: null,
  tools: [tool],
  systemPrompt: 'You are a test assistant.',
}

function textResponse(text: string): StreamResult {
  return { content: text, tool_calls: [], finish_reason: FinishReason.Stop }
}

/** Helper: collect emitted events into an array. */
function collector(): { events: ChatEngineEvent[]; handler: ChatEngineEventHandler } {
  const events: ChatEngineEvent[] = []
  return { events, handler: (e) => events.push(e) }
}

/**
 * Seed an engine's history with a complete "Phase A produced a placeholder" turn:
 *   user → assistant tool_calls → tool placeholder → assistant ack
 * Returns the engine + the placeholder's tool_call_id.
 */
function seedPlaceholderTurn(
  engine: ChatEngine,
  opts: {
    toolCallId?: string
    userMessage?: string
    placeholder?: unknown
    assistantAck?: string
    toolName?: string
    toolArgs?: Record<string, unknown>
  } = {},
): { toolCallId: string } {
  const toolCallId = opts.toolCallId ?? 'call_placeholder_1'
  const userMessage = opts.userMessage ?? "what's my profile?"
  const placeholder = opts.placeholder ?? { kind: 'auth-challenge', message: 'A login form is now shown.' }
  const assistantAck = opts.assistantAck ?? "I'm asking you to log in to continue."
  const toolName = opts.toolName ?? 'get_profile'
  const toolArgs = opts.toolArgs ?? {}

  const history: ChatMessage[] = [
    { role: MessageRole.User, content: userMessage },
    {
      role: MessageRole.Assistant,
      content: null,
      tool_calls: [{
        id: toolCallId,
        type: 'function',
        function: { name: toolName, arguments: JSON.stringify(toolArgs) },
      }],
    },
    {
      role: MessageRole.Tool,
      content: JSON.stringify(placeholder),
      tool_call_id: toolCallId,
    },
    { role: MessageRole.Assistant, content: assistantAck },
  ]
  engine.setHistory(history)
  return { toolCallId }
}

describe('ChatEngine.resumeWithToolResult', () => {
  it('replaces the placeholder tool result in history with the resolved data', async () => {
    const llm: LLMCompletionFn = vi.fn(async (_msgs, _tools, onToken) => {
      const text = 'Your profile shows Emily Johnson (emily@example.com).'
      onToken(text)
      return textResponse(text)
    })
    const executor: ToolExecutorFn = vi.fn()
    const engine = new ChatEngine(llm, executor, ctx, { mergeStrategy: MergeStrategy.Array })
    const { toolCallId } = seedPlaceholderTurn(engine)

    const realData = { id: 1, firstName: 'Emily', lastName: 'Johnson', email: 'emily@example.com' }
    const { handler } = collector()
    const result = await engine.resumeWithToolResult(toolCallId, realData, handler)

    // The placeholder JSON has been replaced with the real data's JSON. The exact
    // serialization must come from truncateToolResult, which uses JSON.stringify.
    const toolMsg = engine.getHistory().find(
      (m) => m.role === MessageRole.Tool && m.tool_call_id === toolCallId,
    )
    expect(toolMsg).toBeDefined()
    // After Phase B, compressToolHistory rewrites the tool message into the focused
    // wrapper. The wrapper must contain the real data (not the placeholder).
    expect(toolMsg!.content).toContain('Emily')
    expect(toolMsg!.content).not.toContain('auth-challenge')

    // Final assistant text references the real data, not the placeholder.
    expect(result.text).toContain('Emily')
    expect(result.toolResults).toHaveLength(1)
    expect(result.toolResults[0]!.data).toEqual(realData)
    expect(result.toolResults[0]!.toolName).toBe('get_profile')

    // Executor was never invoked — resume bypasses tool execution entirely.
    expect(executor).not.toHaveBeenCalled()
  })

  it('strips the trailing placeholder-acknowledgment assistant message before re-running Phase B', async () => {
    // The first Phase B's "I'm asking you to log in" sentence should not survive into
    // the resumed Phase B's input — otherwise the response LLM may anchor on it.
    let observedHistory: ChatMessage[] | undefined
    const llm: LLMCompletionFn = async (msgs, _tools, onToken) => {
      observedHistory = [...msgs]
      const text = 'Profile loaded.'
      onToken(text)
      return textResponse(text)
    }
    const engine = new ChatEngine(llm, vi.fn(), ctx, { mergeStrategy: MergeStrategy.Array })
    const { toolCallId } = seedPlaceholderTurn(engine, {
      assistantAck: "I'm asking you to log in to continue.",
    })

    const { handler } = collector()
    await engine.resumeWithToolResult(toolCallId, { ok: true }, handler)

    expect(observedHistory).toBeDefined()
    const ackMsg = observedHistory!.find(
      (m) => m.role === MessageRole.Assistant && m.content === "I'm asking you to log in to continue.",
    )
    expect(ackMsg).toBeUndefined()
  })

  it('emits ToolCallResult, DataProcessing, StructuredReady, Token, and TurnComplete events', async () => {
    const llm: LLMCompletionFn = async (_msgs, _tools, onToken) => {
      onToken('Done.')
      return textResponse('Done.')
    }
    const engine = new ChatEngine(llm, vi.fn(), ctx, { mergeStrategy: MergeStrategy.Array })
    const { toolCallId } = seedPlaceholderTurn(engine)

    const { events, handler } = collector()
    await engine.resumeWithToolResult(toolCallId, { ok: true }, handler)

    const types = events.map((e) => e.type)
    expect(types).toContain(ChatEventType.ToolCallResult)
    expect(types).toContain(ChatEventType.DataProcessing)
    expect(types).toContain(ChatEventType.StructuredReady)
    expect(types).toContain(ChatEventType.TurnComplete)
    // No new ToolCallStart — the same toolCall is being completed, not retried.
    expect(types).not.toContain(ChatEventType.ToolCallStart)

    const toolResultEvent = events.find((e) => e.type === ChatEventType.ToolCallResult) as
      | { type: typeof ChatEventType.ToolCallResult; toolCallId: string; toolName: string }
      | undefined
    expect(toolResultEvent?.toolCallId).toBe(toolCallId)
    expect(toolResultEvent?.toolName).toBe('get_profile')
  })

  it('throws when the toolCallId does not exist in history', async () => {
    const engine = new ChatEngine(
      async (_m, _t, onToken) => { onToken('x'); return textResponse('x') },
      vi.fn(),
      ctx,
      { mergeStrategy: MergeStrategy.Array },
    )
    seedPlaceholderTurn(engine, { toolCallId: 'call_known' })

    const { handler } = collector()
    await expect(
      engine.resumeWithToolResult('call_unknown', { ok: true }, handler),
    ).rejects.toThrow(/no tool message found/i)
  })

  it('throws when the assistant tool_calls message that issued the toolCallId is missing', async () => {
    // Construct a malformed history: a Tool message with a tool_call_id that no
    // assistant tool_calls message references. resumeWithToolResult must refuse to
    // proceed rather than fabricating the toolName/toolArgs.
    const engine = new ChatEngine(
      async (_m, _t, onToken) => { onToken('x'); return textResponse('x') },
      vi.fn(),
      ctx,
      { mergeStrategy: MergeStrategy.Array },
    )
    engine.setHistory([
      { role: MessageRole.User, content: 'hi' },
      { role: MessageRole.Tool, content: '{}', tool_call_id: 'call_orphan' },
    ])

    const { handler } = collector()
    await expect(
      engine.resumeWithToolResult('call_orphan', { ok: true }, handler),
    ).rejects.toThrow(/no assistant tool_calls message/i)
  })

  it('refuses to resume while another sendMessage/resume is in progress', async () => {
    // Block the LLM call so the first resume is suspended when we try the second.
    let release: (() => void) | undefined
    const blocker = new Promise<void>((resolve) => { release = resolve })
    const llm: LLMCompletionFn = async (_msgs, _tools, onToken) => {
      await blocker
      onToken('done')
      return textResponse('done')
    }
    const engine = new ChatEngine(llm, vi.fn(), ctx, { mergeStrategy: MergeStrategy.Array })
    const { toolCallId } = seedPlaceholderTurn(engine)

    const { handler } = collector()
    const first = engine.resumeWithToolResult(toolCallId, { ok: true }, handler)
    await expect(
      engine.resumeWithToolResult(toolCallId, { ok: true }, handler),
    ).rejects.toThrow(/already in progress/i)
    release!()
    await first
  })

  it('handles unserializable replacement data via the truncation fallback', async () => {
    const llm: LLMCompletionFn = async (_m, _t, onToken) => { onToken('ok'); return textResponse('ok') }
    const engine = new ChatEngine(llm, vi.fn(), ctx, { mergeStrategy: MergeStrategy.Array })
    const { toolCallId } = seedPlaceholderTurn(engine)

    // Circular reference — JSON.stringify throws.
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    const { handler } = collector()
    const result = await engine.resumeWithToolResult(toolCallId, circular, handler)

    // Phase B's fallback Array strategy + compressToolHistory both depend on
    // serializability. The engine must not throw — it surfaces the warning via
    // an Error event and produces a final response.
    expect(result.text.length).toBeGreaterThan(0)
  })
})
