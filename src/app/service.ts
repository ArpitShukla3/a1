import { randomUUID } from 'node:crypto';
import type { Attempt, Evaluation, LearnerSkillProfile, LLMProvider, SkillObservation, SubmissionContent } from '../domain/types.js';
import { evaluationJobId } from '../domain/types.js';
import { InMemoryAttemptRepository, InMemoryEvaluationRepository, InMemoryLearnerSkillProfileRepository, InMemoryProblemRepository, InMemorySkillRepository, InMemorySubmissionRepository } from '../repos/memory.js';
import { EvaluationOrchestrator, evaluationEvents } from '../ai/orchestrator.js';
import { providerFromEnv } from '../ai/providers.js';

export { evaluationEvents };

export const store = {
  problems: new InMemoryProblemRepository(),
  skills: new InMemorySkillRepository(),
  attempts: new InMemoryAttemptRepository(),
  submissions: new InMemorySubmissionRepository(),
  evaluations: new InMemoryEvaluationRepository(),
  profiles: new InMemoryLearnerSkillProfileRepository(),
};

const TEXT_FIELDS = ['requirementsUnderstanding', 'assumptions', 'classes', 'responsibilities', 'relationships', 'mainFlow', 'designDecisions', 'edgeCases'] as const;

export function validateSubmissionContent(c: SubmissionContent): string[] {
  if (!c || typeof c !== 'object') return ['submission must be an object'];
  if (c.kind === 'solution') {
    const v = (c as { solution?: unknown }).solution;
    if (typeof v !== 'string' || !v.trim()) return ['solution is required'];
    return [];
  }
  if ((c as { kind: string }).kind !== 'text') return []; // future kinds validated elsewhere
  const errs: string[] = [];
  for (const f of TEXT_FIELDS) {
    const v = (c as Record<string, unknown>)[f];
    if (typeof v !== 'string' || !v.trim()) errs.push(`${f} is required`);
  }
  return errs;
}

export function computeProfile(learnerId: string, skillId: string, obs: SkillObservation[]): LearnerSkillProfile {
  const n = obs.length;
  if (!n) return { learnerId, skillId, count: 0, average: 0, recentAverage: 0, trend: 'insufficient-data', recurringWeaknesses: [], recurringStrengths: [] };
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pct = obs.map(o => o.score / o.maxScore);
  const average = avg(pct);
  const recent = obs.slice(-3);
  const recentAverage = avg(recent.map(o => o.score / o.maxScore));
  let trend: LearnerSkillProfile['trend'] = 'insufficient-data';
  if (n >= 3) {
    const older = avg(obs.slice(0, -1).map(o => o.score / o.maxScore));
    const last = obs[n - 1].score / obs[n - 1].maxScore;
    trend = last - older > 0.05 ? 'improving' : older - last > 0.05 ? 'declining' : 'stable';
  }
  const countTags = (get: (o: SkillObservation) => string[]) => {
    const m = new Map<string, number>();
    for (const o of obs) for (const t of get(o)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].filter(([, c]) => c >= 2).map(([t]) => t);
  };
  return {
    learnerId, skillId, count: n, average: +average.toFixed(3), recentAverage: +recentAverage.toFixed(3), trend,
    recurringWeaknesses: countTags(o => o.weaknessTags), recurringStrengths: countTags(o => o.strengthTags),
  };
}

export class PracticeService {
  constructor(private llm: LLMProvider = providerFromEnv()) {}

  async createAttempt(learnerId: string, problemId: string): Promise<Attempt> {
    if (!learnerId) throw Object.assign(new Error('learnerId required'), { status: 400 });
    const problem = await store.problems.get(problemId);
    if (!problem) throw Object.assign(new Error('unknown problem'), { status: 404 });
    const now = new Date().toISOString();
    const a: Attempt = { id: randomUUID(), learnerId, problemId, status: 'DRAFT', submissionVersion: 0, createdAt: now, updatedAt: now };
    return store.attempts.create(a);
  }

  async putSubmission(attemptId: string, content: SubmissionContent) {
    const attempt = await store.attempts.get(attemptId);
    if (!attempt) throw Object.assign(new Error('unknown attempt'), { status: 404 });
    if (attempt.status !== 'DRAFT' && attempt.status !== 'FAILED')
      throw Object.assign(new Error(`cannot edit submission in ${attempt.status}`), { status: 409 });
    const errs = validateSubmissionContent(content);
    if (!errs.length && content.kind === 'text') {
      const total = TEXT_FIELDS.map(f => ((content as Record<string, string>)[f] ?? '').trim()).join(' ');
      if (!total) errs.push('submission is empty');
    }
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 400 });
    attempt.submissionVersion += 1;
    attempt.submission = content;
    attempt.updatedAt = new Date().toISOString();
    await store.attempts.update(attempt);
    await store.submissions.save({ attemptId, version: attempt.submissionVersion, content, createdAt: attempt.updatedAt });
    return attempt;
  }

  // POST /attempts/:id/submit: single entry point. Optional {solution} is validated
  // and persisted FIRST, then SUBMITTED → async eval → return fast.
  async submit(attemptId: string, solution?: SubmissionContent): Promise<Attempt> {
    if (solution !== undefined) await this.putSubmission(attemptId, solution);
    const attempt = await store.attempts.get(attemptId);
    if (!attempt) throw Object.assign(new Error('unknown attempt'), { status: 404 });
    if (!attempt.submission || attempt.submissionVersion < 1)
      throw Object.assign(new Error('no submission to evaluate'), { status: 400 });
    if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING') return attempt; // idempotent fast-path
    if (attempt.status !== 'DRAFT' && attempt.status !== 'FAILED')
      throw Object.assign(new Error(`already ${attempt.status}`), { status: 409 });
    const jobId = evaluationJobId(attemptId, attempt.submissionVersion);
    const existing = await store.evaluations.get(jobId);
    if (existing?.status === 'COMPLETED') { attempt.status = 'COMPLETED'; }
    else {
      attempt.status = 'SUBMITTED';
      // Fire-and-forget; runEvaluation moves SUBMITTED→EVALUATING→COMPLETED/FAILED. Submission already persisted.
      setImmediate(() => this.runEvaluation(attemptId, attempt.submissionVersion).catch(() => {}));
    }
    attempt.evaluationJobId = jobId;
    attempt.updatedAt = new Date().toISOString();
    return store.attempts.update(attempt);
  }

  // Delegates the whole pipeline to the orchestrator: select skills → scenario tasks
  // → parallel eval → aggregate → learner memory → streamed events.
  async runEvaluation(attemptId: string, version: number): Promise<Evaluation> {
    return new EvaluationOrchestrator({ ...store }, this.llm).run(attemptId, version);
  }

  async retry(attemptId: string): Promise<Evaluation> {
    const attempt = await store.attempts.get(attemptId);
    if (!attempt) throw Object.assign(new Error('unknown attempt'), { status: 404 });
    if (attempt.status !== 'FAILED') throw Object.assign(new Error(`nothing to retry in ${attempt.status}`), { status: 409 });
    return this.runEvaluation(attemptId, attempt.submissionVersion);
  }

  async skillProfiles(learnerId: string): Promise<LearnerSkillProfile[]> {
    const skills = await store.skills.list();
    return Promise.all(skills.map(async s =>
      computeProfile(learnerId, s.id, await store.profiles.observations(learnerId, s.id))));
  }
}
