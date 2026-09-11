import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMRequest, LLMResponse } from '../../application/evaluator/types.js';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: buildClaudeSystem(request),
      messages: [{ role: 'user', content: request.userMessage }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error(`Unexpected Anthropic response block: ${block?.type ?? 'none'}`);
    }
    return { content: block.text };
  }
}

function buildClaudeSystem(request: LLMRequest): string {
  return `${request.systemPrompt}\n\nYou must respond with ONLY valid JSON. Do not include markdown, code fences, or any prose outside the JSON object.`;
}

// Batch API extension point (not active in MVP): each evaluation task carries a
// deterministic taskId (evaluationJobId + skillId). To move to batch evaluation,
// queue generate() calls per task, send them via Anthropic Batch API keyed on
// taskId, and replay responses back through evaluator.evaluate(). This class
// stays unchanged; only the transport (single-call vs batch) changes.