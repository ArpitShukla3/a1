import type {
  Attempt, EvalEvent, Evaluation, EvaluationEventPublisher, EvaluationTask,
  Feedback, LLMProvider, Problem, Skill, SkillEvaluationResult, SubmissionContent,
} from '../domain/types.js';
import { evaluationJobId } from '../domain/types.js';
import type {
  AttemptRepository, EvaluationRepository, LearnerSkillProfileRepository,
  ProblemRepository, SkillRepository, SubmissionRepository,
} from '../domain/types.js';
import { EvaluationRunner, SkillEvaluator } from './evaluator.js';

// ---- EvaluationEventPublisher: in-memory pub/sub + per-job event log (replay for late SSE subscribers) ----
class InMemoryEventPublisher implements EvaluationEventPublisher {
  private log = new Map<string, EvalEvent[]>();
  private subs = new Map<string, Set<(e: EvalEvent) => void>>();
  publish(e: EvalEvent): void {
    const log = this.log.get(e.jobId) ?? [];
    log.push(e);
    this.log.set(e.jobId, log);
    for (const fn of this.subs.get(e.jobId) ?? []) {
      try { fn(e); } catch { /* subscriber gone */ }
    }
  }
  history(jobId: string): EvalEvent[] { return this.log.get(jobId) ?? []; }
  subscribe(jobId: string, fn: (e: EvalEvent) => void): () => void {
    const set = this.subs.get(jobId) ?? new Set();
    set.add(fn);
    this.subs.set(jobId, set);
    return () => { set.delete(fn); };
  }
}

// Singleton: one process, one event bus (in-memory MVP).
export const evaluationEvents: EvaluationEventPublisher = new InMemoryEventPublisher();

export function isTerminal(jobId: string): boolean {
  return evaluationEvents.history(jobId).some(e => e.type === 'evaluation.completed' || e.type === 'evaluation.failed');
}

// ---- SkillSelector: applicable skills come from the problem's evaluation profile. Frontend never knows this. ----
export function selectSkills(problem: Problem, all: Skill[]): Skill[] {
  const order = new Map(problem.skillIds.map((id, i) => [id, i]));
  return all.filter(s => order.has(s.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

// ---- ScenarioBuilder: every skill gets the SAME complete solution + its primary curated scenario probe. ----
export function buildTasks(jobId: string, problem: Problem, skills: Skill[], submission: SubmissionContent): EvaluationTask[] {
  return skills.map(skill => ({
    taskId: `${jobId}:${skill.id}`,
    skill,
    scenario: skill.scenarios[0], // primary probe; skill carries the full curated set
    problem,
    submission,
  }));
}

// ---- ResultAggregator: deterministic. No LLM invents the overall score. ----
export function aggregateResults(
  results: SkillEvaluationResult[],
  celebrations: string[] = [],
): { aggregate: Evaluation['aggregate']; feedback: Feedback } {
  const totalScore = results.reduce((a, r) => a + r.score, 0);
  const maxTotal = results.reduce((a, r) => a + r.maxScore, 0);
  const norm = results.map(r => ({ id: r.skillId, name: r.skillName, pct: r.score / Math.max(1, r.maxScore) }))
    .sort((a, b) => b.pct - a.pct);
  const strongest = norm.slice(0, 2).map(s => s.id);
  const weakest = norm.slice(-2).reverse().map(s => s.id);
  const avgConfidence = results.length
    ? +(results.reduce((a, r) => a + r.confidence, 0) / results.length).toFixed(3) : 0;
  const bySkill = results.map(r => ({ skillId: r.skillId, score: r.score, maxScore: r.maxScore, suggestions: r.suggestions }));
  const weakSet = new Set(weakest);
  const feedback: Feedback = {
    summary: `Evaluated ${results.length} skills. Average ${(totalScore / Math.max(1, maxTotal) * 5).toFixed(2)}/5.` +
      (norm.length ? ` Strongest: ${norm[0].name}. Needs work: ${norm[norm.length - 1].name}.` : ''),
    strengths: results.flatMap(r => r.strengths).slice(0, 8),
    improvements: results.flatMap(r => r.suggestions).slice(0, 8),
    priorityImprovements: results.filter(r => weakSet.has(r.skillId)).flatMap(r => r.suggestions).slice(0, 5),
    celebrations,
    bySkill,
  };
  return {
    aggregate: {
      totalScore, maxTotal, average: +(totalScore / Math.max(1, maxTotal)).toFixed(3),
      strongest, weakest, avgConfidence,
    },
    feedback,
  };
}

// ---- LearnerProgressUpdater: SkillEvaluationResult → SkillObservation → profile math stays deterministic ----
export async function recordObservations(
  profiles: LearnerSkillProfileRepository,
  attempt: Attempt, problemId: string, results: SkillEvaluationResult[], timestamp: string,
): Promise<void> {
  for (const r of results) {
    await profiles.addObservation({
      learnerId: attempt.learnerId, attemptId: attempt.id, problemId,
      skillId: r.skillId, skillVersion: r.skillVersion, score: r.score, maxScore: r.maxScore,
      scenarioId: r.scenarioId, weaknessTags: r.weaknessTags, strengthTags: r.strengthTags,
      evidence: r.evidence, timestamp,
    });
  }
}

export interface OrchestratorDeps {
  attempts: AttemptRepository;
  submissions: SubmissionRepository;
  evaluations: EvaluationRepository;
  profiles: LearnerSkillProfileRepository;
  skills: SkillRepository;
  problems: ProblemRepository;
}

// ---- EvaluationOrchestrator: owns the whole pipeline after one complete solution is persisted ----
export class EvaluationOrchestrator {
  constructor(private deps: OrchestratorDeps, private llm: LLMProvider) {}

  async run(attemptId: string, version: number): Promise<Evaluation> {
    const { attempts, submissions, evaluations, profiles, skills, problems } = this.deps;
    const jobId = evaluationJobId(attemptId, version);
    const done = await evaluations.get(jobId);
    if (done?.status === 'COMPLETED') return done; // duplicate evaluation → reuse
    const attempt = await attempts.get(attemptId);
    if (!attempt) throw new Error('unknown attempt');
    const [problem, submission] = await Promise.all([
      problems.get(attempt.problemId),
      submissions.get(attemptId, version),
    ]);
    if (!problem || !submission) throw new Error('missing problem/submission');
    attempt.status = 'EVALUATING';
    attempt.evaluationJobId = jobId;
    attempt.updatedAt = new Date().toISOString();
    await attempts.update(attempt);

    const selected = selectSkills(problem, await skills.list());
    evaluationEvents.publish({
      type: 'evaluation.started', jobId, attemptId,
      skills: selected.map(s => ({ skillId: s.id, skillName: s.name })),
    });
    // ponytail: local CPU Ollama — strictly linear one-by-one (OLLAMA_CONCURRENCY=1)
    // so the first skill's tokens reach the client fast; remote APIs stay fully parallel.
    const concurrency = this.llm.name === 'ollama' ? Number(process.env.OLLAMA_CONCURRENCY ?? 1) : Infinity;
    const runner = new EvaluationRunner(new SkillEvaluator(this.llm), concurrency);
    try {
      const results = await runner.run(buildTasks(jobId, problem, selected, submission.content), {
        onStarted: t => evaluationEvents.publish({ type: 'skill.started', jobId, skillId: t.skill.id, skillName: t.skill.name }),
        onToken: (t, token) => evaluationEvents.publish({ type: 'skill.token', jobId, skillId: t.skill.id, token }),
        onCompleted: (t, r) => evaluationEvents.publish({ type: 'skill.completed', jobId, skillId: t.skill.id, result: r }),
        onFailed: (t, err) => evaluationEvents.publish({
          type: 'skill.failed', jobId, skillId: t.skill.id,
          error: (err as Error).message, retryable: true, // message only, never stack traces
        }),
      });
      // Appreciation is deterministic: compare against the learner's own history BEFORE recording this run.
      const findCelebrations = async (): Promise<string[]> => {
        const out: string[] = [];
        for (const r of results) {
          const prior = await profiles.observations(attempt.learnerId, r.skillId);
          if (!prior.length) continue;
          const prev = prior.reduce((a, o) => a + o.score / o.maxScore, 0) / prior.length;
          const cur = r.score / r.maxScore;
          if (cur - prev > 0.05) {
            out.push(`${r.skillName} up from ${(prev * 5).toFixed(1)} to ${(cur * 5).toFixed(1)} — keep it up.`);
          }
        }
        return out;
      };
      const { aggregate, feedback } = aggregateResults(results, await findCelebrations());
      const evaluation: Evaluation = {
        id: jobId, attemptId, submissionVersion: version, status: 'COMPLETED',
        results, aggregate, feedback, createdAt: new Date().toISOString(),
      };
      await evaluations.save(evaluation);
      const now = new Date().toISOString();
      await recordObservations(profiles, attempt, attempt.problemId, results, now);
      attempt.status = 'COMPLETED';
      attempt.updatedAt = now;
      await attempts.update(attempt);
      evaluationEvents.publish({ type: 'evaluation.completed', jobId, evaluation });
      return evaluation;
    } catch (err) {
      // Submission is safe (persisted before eval). Record failure for retry.
      const failed: Evaluation = {
        id: jobId, attemptId, submissionVersion: version, status: 'FAILED', results: [],
        aggregate: { totalScore: 0, maxTotal: 0, average: 0, strongest: [], weakest: [], avgConfidence: 0 },
        feedback: { summary: 'Evaluation failed', strengths: [], improvements: [], priorityImprovements: [], celebrations: [], bySkill: [] },
        error: (err as Error).message, createdAt: new Date().toISOString(),
      };
      await evaluations.save(failed);
      attempt.status = 'FAILED';
      attempt.updatedAt = new Date().toISOString();
      await attempts.update(attempt);
      evaluationEvents.publish({ type: 'evaluation.failed', jobId, error: (err as Error).message, retryable: true });
      throw err;
    }
  }
}
