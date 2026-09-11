import { get } from './client.js';
import type { EvalStreamEvent, Evaluation } from '../types.js';

export const getEvaluation = (attemptId: string): Promise<Evaluation> =>
  get<Evaluation>(`/api/attempts/${attemptId}/evaluation`);

// Live evaluation stream (SSE). Renders results as they arrive; the existing
// polling path stays as fallback if the stream drops.
export function subscribeToEvaluation(
  attemptId: string,
  onEvent: (e: EvalStreamEvent) => void,
): () => void {
  const src = new EventSource(`/api/attempts/${attemptId}/evaluation-events`);
  const types = ['evaluation.started', 'skill.started', 'skill.token', 'skill.completed', 'skill.failed', 'evaluation.completed', 'evaluation.failed'];
  const handlers = types.map(t => {
    const h = (ev: MessageEvent) => {
      try { onEvent(JSON.parse(ev.data) as EvalStreamEvent); } catch { /* ignore malformed */ }
    };
    src.addEventListener(t, h as EventListener);
    return [t, h] as const;
  });
  return () => {
    for (const [t, h] of handlers) src.removeEventListener(t, h as EventListener);
    src.close();
  };
}
