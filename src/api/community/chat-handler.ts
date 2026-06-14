import Anthropic from '@anthropic-ai/sdk';
import type { Model } from '@anthropic-ai/sdk/resources';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  GET_CONCEPT_TOOL,
  JSON_GET_WIDGET_SPEC_TOOL,
  JSON_VALIDATE_FORM_DEFINITION_TOOL,
  getConcept,
  getWidgetSpec,
  validateFormDefinition,
} from '@golemui/gui-mcp/json';
import { generatePrompt } from './golem-prompt';

// ---------------------------------------------------------------------------
// Tool definitions: descriptions and input schemas come directly from the MCP
// package so they stay in sync with the library.
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'json_get_widget_spec',
    description: JSON_GET_WIDGET_SPEC_TOOL.description,
    input_schema:
      JSON_GET_WIDGET_SPEC_TOOL.inputSchema as unknown as Anthropic.Tool['input_schema'],
  },
  {
    name: 'get_concept',
    description: GET_CONCEPT_TOOL.description,
    input_schema: GET_CONCEPT_TOOL.inputSchema as unknown as Anthropic.Tool['input_schema'],
  },
  {
    name: 'json_validate_form_definition',
    description: JSON_VALIDATE_FORM_DEFINITION_TOOL.description,
    input_schema:
      JSON_VALIDATE_FORM_DEFINITION_TOOL.inputSchema as unknown as Anthropic.Tool['input_schema'],
  },
];

function executeTool(name: string, input: unknown): unknown {
  if (name === 'json_get_widget_spec') {
    return getWidgetSpec(input as Parameters<typeof getWidgetSpec>[0]);
  }
  if (name === 'get_concept') {
    return getConcept(input as Parameters<typeof getConcept>[0]);
  }
  if (name === 'json_validate_form_definition') {
    return validateFormDefinition({ formDefinition: input });
  }
  throw new Error(`Unknown tool: ${name}`);
}

function parseFormJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = match ? match[1].trim() : text.trim();
  return JSON.parse(json);
}

// Context window sizes (input tokens) per model. Used to compute available-context percentage.
const MODEL_CONTEXT_WINDOWS = {
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
} satisfies Partial<Record<Model, number>>;

const CHAT_MODEL: keyof typeof MODEL_CONTEXT_WINDOWS = 'claude-haiku-4-5-20251001';

interface ChatEnv {
  ANTHROPIC_API_KEY: string;
}

export interface ChatHandlerOptions {
  /**
   * Called after the SSE stream completes (even on error) with the total tokens consumed.
   * The pro API layer uses this to write token usage back to D1.
   * Community deployments omit this — no quota tracking.
   */
  onTokensUsed?: (tokens: number) => Promise<void>;
}

/**
 * Handles a POST /api/chat request end-to-end: parses the body, streams SSE events,
 * runs the Claude tool-use loop, and emits the final form definition.
 *
 * @param c - Hono context. Bindings must include ANTHROPIC_API_KEY.
 * @param options - Optional hooks. Pass onTokensUsed to track quota in the pro layer.
 */
export async function handleChatRequest<TBindings extends ChatEnv>(
  c: Context<{ Bindings: TBindings }>,
  options?: ChatHandlerOptions,
): Promise<Response> {
  // Parse body before starting the stream — cannot read body after SSE headers are sent.
  const {
    message,
    files = [],
    history = [],
  } = await c.req.json<{
    message: string;
    files: Array<{ name: string; mimeType: string; base64Data: string }>;
    history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  }>();

  // Accumulates tokens across all tool-use loop iterations.
  let totalTokensUsed = 0;
  // Tracks input tokens from the most recent Claude API call (for context window meter).
  let lastInputTokens = 0;

  return streamSSE(c, async (sseStream) => {
    try {
      const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

      const priorMessages: Anthropic.MessageParam[] = history.map((h) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts.map((p) => p.text).join(''),
      }));

      const userContent: Anthropic.ContentBlockParam[] = [];
      for (const f of files) {
        if (f.mimeType.startsWith('image/')) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: f.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: f.base64Data,
            },
          });
        } else if (f.mimeType === 'application/pdf') {
          userContent.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.base64Data },
          } as unknown as Anthropic.ContentBlockParam);
        }
        // Unsupported types are silently omitted. The user message text describes them.
      }
      userContent.push({
        type: 'text',
        text:
          message.trim() ||
          'Analyze the attached document(s) and generate the GolemUI form definition.',
      });

      let messages: Anthropic.MessageParam[] = [
        ...priorMessages,
        { role: 'user', content: userContent },
      ];

      // -----------------------------------------------------------------------
      // Tool use loop: stream each turn, execute any tool calls, then continue.
      // -----------------------------------------------------------------------

      while (true) {
        const runner = client.messages.stream({
          model: CHAT_MODEL,
          max_tokens: 16000,
          thinking: { type: 'enabled', budget_tokens: 10000 },
          system: generatePrompt(),
          messages,
          tools: TOOLS,
        });

        let accumulatedText = '';
        let inThinkingBlock = false;

        for await (const event of runner) {
          if (event.type === 'content_block_start') {
            if ((event.content_block as { type: string }).type === 'thinking') {
              inThinkingBlock = true;
              await sseStream.writeSSE({ data: JSON.stringify({ type: 'thought_start' }) });
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta') {
              await sseStream.writeSSE({
                data: JSON.stringify({ type: 'thought_delta', text: event.delta.thinking }),
              });
            } else if (event.delta.type === 'text_delta') {
              accumulatedText += event.delta.text;
            }
          } else if (event.type === 'content_block_stop') {
            if (inThinkingBlock) {
              inThinkingBlock = false;
              await sseStream.writeSSE({ data: JSON.stringify({ type: 'thought_end' }) });
            }
          }
        }

        const finalMessage = await runner.finalMessage();

        totalTokensUsed += finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;
        lastInputTokens = finalMessage.usage.input_tokens;

        if (finalMessage.stop_reason === 'end_turn') {
          const contextUsedPercent = Math.min(
            100,
            Math.round((lastInputTokens / MODEL_CONTEXT_WINDOWS[CHAT_MODEL]) * 100),
          );
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'context_usage', usedPercent: contextUsedPercent }),
          });
          const form = parseFormJson(accumulatedText);
          await sseStream.writeSSE({ data: JSON.stringify({ type: 'result', form }) });
          break;
        }

        if (finalMessage.stop_reason === 'tool_use') {
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of finalMessage.content) {
            if (block.type !== 'tool_use') {
              continue;
            }

            await sseStream.writeSSE({
              data: JSON.stringify({ type: 'tool_call', name: block.name, input: block.input }),
            });

            let result: unknown;
            try {
              result = executeTool(block.name, block.input);
            } catch (e: unknown) {
              result = { error: (e as Error).message };
            }

            if (block.name === 'json_validate_form_definition') {
              const vr = result as {
                valid: boolean;
                errors?: Array<{ path: string; message: string; suggestion?: string }>;
              };
              const errors = vr.valid
                ? []
                : (vr.errors ?? []).slice(0, 6).map((e) => {
                    const loc = e.path ? `${e.path}: ` : '';
                    return e.suggestion
                      ? `${loc}${e.message} -> ${e.suggestion}`
                      : `${loc}${e.message}`;
                  });
              await sseStream.writeSSE({
                data: JSON.stringify({ type: 'tool_result', name: block.name, errors }),
              });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }

          messages = [
            ...messages,
            { role: 'assistant', content: finalMessage.content },
            { role: 'user', content: toolResults },
          ];
        }
      }
    } catch (err: unknown) {
      await sseStream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: (err as Error)?.message ?? 'Unknown error',
        }),
      });
    } finally {
      // Always report token usage — even if the stream errored partway through.
      if (totalTokensUsed > 0 && options?.onTokensUsed) {
        await options.onTokensUsed(totalTokensUsed);
      }
    }
  });
}
