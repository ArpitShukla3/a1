import type { EvaluationTask, Evaluator, LLMProvider, SkillEvaluationResult } from '../domain/types.js';
import { buildSkillPrompt, parseSkillJson } from './providers.js';

export class SkillEvaluator implements Evaluator {
  constructor(private llm: LLMProvider) {}
  async evaluate(task: EvaluationTask, onToken?: (token: string) => void): Promise<SkillEvaluationResult> {
    // ponytail: one retry — small models usually emit valid JSON; only the attempt is lost otherwise.
    let result = await this.once(task, onToken);
    if (result.weaknessTags.includes('unparseable-output')) result = await this.once(task);
    return result;
  }
  private async once(task: EvaluationTask, onToken?: (token: string) => void): Promise<SkillEvaluationResult> {
    const raw = await this.llm.generate(buildSkillPrompt(task), onToken);
    return parseSkillJson(raw, task);
  }
}

export interface RunnerHooks {
  onStarted?: (task: EvaluationTask) => void;
  onToken?: (task: EvaluationTask, token: string) => void;
  onCompleted?: (task: EvaluationTask, result: SkillEvaluationResult) => void;
  onFailed?: (task: EvaluationTask, err: unknown) => void;
}

// Run skill evaluations. Concurrency caps fan-out; OLLAMA_CONCURRENCY=1 → strictly
// linear (one skill at a time), so each result streams to the client as it finishes
// and CPU inference isn't thrashing 1 model across 8 parallel generations.
// Hooks fire per task as each finishes (true streaming even within a wave).
export class EvaluationRunner {
  constructor(private evaluator: Evaluator, private concurrency = Infinity) {}
  async run(tasks: EvaluationTask[], hooks: RunnerHooks = {}): Promise<SkillEvaluationResult[]> {
    const out: SkillEvaluationResult[] = new Array(tasks.length);
    for (let i = 0; i < tasks.length; i += this.concurrency) {
      const chunk = tasks.slice(i, i + this.concurrency);
      const results = await Promise.all(chunk.map((t, j) => {
        hooks.onStarted?.(t);
        return this.evaluator.evaluate(t, tok => hooks.onToken?.(t, tok)).then(
          r => { out[i + j] = r; hooks.onCompleted?.(t, r); return r; },
          err => { hooks.onFailed?.(t, err); throw err; },
        );
      }));
      void results;
    }
    return out;
  }
}
