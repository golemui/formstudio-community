import { Injectable } from '@angular/core';

export interface FileAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export type ChatHistoryEntry = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

export interface GolemFormDef {
  form: unknown[];
}

export interface QuotaInfo {
  tier: string;
  resetsAt: string;
}

export type StreamEvent =
  | { type: 'thought_start' }
  | { type: 'thought_delta'; text: string }
  | { type: 'thought_end' }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; errors: string[] }
  | { type: 'context_usage'; usedPercent: number }
  | { type: 'quota_exceeded'; tier: string; resetsAt: string };

@Injectable()
export class AiService {
  async sendMessage(
    message: string,
    files: FileAttachment[] = [],
    history: ChatHistoryEntry[] = [],
    chatApiUrl: string,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<GolemFormDef | undefined> {
    const response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, files, history }),
    });

    if (response.status === 402) {
      const body = (await response.json()) as { tier: string; resetsAt: string; error: string };
      onEvent?.({ type: 'quota_exceeded', tier: body.tier, resetsAt: body.resetsAt });
      return undefined;
    }

    if (!response.body) {
      return undefined;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }
        const event = JSON.parse(line.slice(6));
        if (event.type === 'thought_start') {
          onEvent?.({ type: 'thought_start' });
        } else if (event.type === 'thought_delta') {
          onEvent?.({ type: 'thought_delta', text: event.text });
        } else if (event.type === 'thought_end') {
          onEvent?.({ type: 'thought_end' });
        } else if (event.type === 'tool_call') {
          onEvent?.({ type: 'tool_call', name: event.name, input: event.input });
        } else if (event.type === 'tool_result') {
          onEvent?.({ type: 'tool_result', name: event.name, errors: event.errors });
        } else if (event.type === 'context_usage') {
          onEvent?.({ type: 'context_usage', usedPercent: event.usedPercent });
        } else if (event.type === 'result') {
          return event.form;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }

    return undefined;
  }
}
