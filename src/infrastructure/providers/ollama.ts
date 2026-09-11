import { LLMProvider, LLMRequest, LLMResponse } from '../../application/evaluator/types.js';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage },
        ],
        format: 'json',
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const content = data.message?.content;
    if (!content) throw new Error('Ollama returned empty content');

    return { content };
  }
}