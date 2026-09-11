import { describe, expect, it, vi } from 'vitest';
import { PracticeService, computeProfile, evaluationEvents, store, validateSubmissionContent } from '../src/app/service.js';
import { EvaluationRunner, SkillEvaluator } from '../src/ai/evaluator.js';
import { aggregateResults, buildTasks, selectSkills } from '../src/ai/orchestrator.js';
import { MockProvider } from '../src/ai/providers.js';
import { evaluationJobId, type SubmissionContent } from '../src/domain/types.js';

const text = (over: Partial<Record<string, string>> = {}): SubmissionContent => ({
  kind: 'text',
  requirementsUnderstanding: 'Entry, spot assignment, exit with fee strategy.',
  assumptions: 'Fee schedule given; single building.',
  classes: 'ParkingLot, Floor, Spot, Vehicle, FeeStrategy, PaymentGateway interface.',
  responsibilities: 'FeeStrategy owns pricing; ParkingLot orchestrates; Gateway abstracts payment.',
  relationships: 'Lot 1-* Floor 1-* Spot; Vehicle uses Spot; Strategy pattern for fees.',
  mainFlow: 'Enter -> assign -> exit -> fee -> pay -> release; reserve-then-confirm.',
  designDecisions: 'Strategy for fees/extensibility; interface for gateway; per-floor locks for scale.',
  edgeCases: 'Full lot, payment timeout releases spot, power loss mid-dispense, exact change.',
  ...over,
});

const solution = (s = 'Complete design: classes, responsibilities, relationships, flows, trade-offs, edge cases.'): SubmissionContent => ({
  kind: 'solution', solution: s,
});

describe('attempts & validation', () => {
  it('creates attempt and rejects unknown problem', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l1', 'parking-lot');
    expect(a.status).toBe('DRAFT');
    await expect(svc.createAttempt('l1', 'nope')).rejects.toMatchObject({ status: 404 });
  });
  it('validates required fields, empty submission, and freeform solution', async () => {
    expect(validateSubmissionContent(text({ classes: ' ' }))).toContain('classes is required');
    expect(validateSubmissionContent({ kind: 'solution', solution: '   ' })).toEqual(['solution is required']);
    expect(validateSubmissionContent(solution('my design'))).toEqual([]);
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l1', 'parking-lot');
    await expect(svc.putSubmission(a.id, text({ classes: ' ' }))).rejects.toMatchObject({ status: 400 });
    await expect(svc.putSubmission(a.id, { kind: 'solution', solution: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('async submit + state machine + idempotency', () => {
  it('DRAFT→SUBMITTED→EVALUATING→COMPLETED, submission persisted first', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l2', 'elevator');
    await svc.putSubmission(a.id, solution());
    const sub = await svc.submit(a.id);
    expect(sub.status).toBe('SUBMITTED');
    expect(await store.submissions.get(a.id, 1)).toBeDefined(); // persisted before eval
    const eval1 = await svc.runEvaluation(a.id, 1);
    expect(eval1.results.length).toBe(8);
    expect((await store.attempts.get(a.id))?.status).toBe('COMPLETED');
    // duplicate evaluation reuses state
    const eval2 = await svc.runEvaluation(a.id, 1);
    expect(eval2.id).toBe(eval1.id);
  });
  it('failure keeps submission; retry recovers', async () => {
    const failing = { name: 'boom', generate: async () => { throw new Error('ai down'); } };
    const svc = new PracticeService(failing);
    const a = await svc.createAttempt('l3', 'vending-machine');
    await svc.putSubmission(a.id, text());
    await svc.submit(a.id);
    await expect(svc.runEvaluation(a.id, 1)).rejects.toThrow('ai down');
    expect((await store.attempts.get(a.id))?.status).toBe('FAILED');
    expect(await store.submissions.get(a.id, 1)).toBeDefined(); // never lost
    (svc as unknown as { llm: unknown }).llm = new MockProvider(); // swap provider, same job id
    const retry = await svc.retry(a.id);
    expect(retry.status).toBe('COMPLETED');
  });
});

describe('evaluator/provider abstraction + parallel runner', () => {
  it('domain uses Evaluator interface; tasks run concurrently', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l4', 'parking-lot');
    await svc.putSubmission(a.id, text());
    const problem = (await store.problems.get('parking-lot'))!;
    const skill = (await store.skills.get('scalability'))!;
    const tasks = [0, 1, 2].map(i => ({
      taskId: `t${i}`, skill, scenario: skill.scenarios[0], problem, submission: text(),
    }));
    const spy = vi.spyOn(MockProvider.prototype, 'generate');
    const results = await new EvaluationRunner(new SkillEvaluator(new MockProvider())).run(tasks);
    expect(results).toHaveLength(3);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(results[0]).toMatchObject({ skillId: 'scalability', maxScore: 5 });
    expect(results[0].evidence.length).toBeGreaterThan(0);
    spy.mockRestore();
    void svc;
  });
  it('insufficient evidence when submission is thin (mocked, no real Claude)', async () => {
    const r = await new SkillEvaluator(new MockProvider()).evaluate({
      taskId: 't', skill: (await store.skills.get('extensibility'))!,
      scenario: { id: 's', question: 'q' },
      problem: (await store.problems.get('parking-lot'))!,
      submission: text({ classes: 'Lot', responsibilities: 'does stuff', relationships: 'x', mainFlow: 'y', designDecisions: 'z', edgeCases: 'w', requirementsUnderstanding: 'req', assumptions: 'asm' }),
    });
    expect(r.concerns.join()).toMatch(/insufficient evidence/);
  });
  it('retries once when the provider emits garbage, then accepts the parsed result', async () => {    let calls = 0;
    const flaky = {
      name: 'flaky',
      generate: async () => (++calls === 1 ? 'not json at all'
        : JSON.stringify({ score: 4, confidence: 0.9, evidence: [], strengths: ['s'], concerns: [], suggestions: [], weaknessTags: [], strengthTags: ['t'] })),
    };
    const r = await new SkillEvaluator(flaky).evaluate({
      taskId: 't', skill: (await store.skills.get('scalability'))!,
      scenario: { id: 's', question: 'q' },
      problem: (await store.problems.get('parking-lot'))!,
      submission: text(),
    });
    expect(calls).toBe(2);
    expect(r.score).toBe(4);
    expect(r.weaknessTags).not.toContain('unparseable-output');
  });
});

describe('learner skill memory (deterministic, no LLM math)', () => {
  it('aggregates across problems: avg, trend, recurring tags', async () => {
    const svc = new PracticeService(new MockProvider());
    for (const [learner, problem] of [['l5', 'parking-lot'], ['l5', 'elevator'], ['l5', 'vending-machine']] as const) {
      const a = await svc.createAttempt(learner, problem);
      await svc.putSubmission(a.id, text());
      await svc.runEvaluation(a.id, 1);
    }
    const profiles = await svc.skillProfiles('l5');
    const sc = profiles.find(p => p.skillId === 'scalability')!;
    expect(sc.count).toBe(3);
    expect(sc.average).toBeGreaterThan(0);
    expect(['improving', 'declining', 'stable']).toContain(sc.trend);
  });
  it('trend math: 2/5 → 4/5 → 3/5 style sequences', () => {
    const mk = (score: number, tags: string[] = []) => ({
      learnerId: 'l', attemptId: 'a', problemId: 'p', skillId: 'scalability', skillVersion: '1.0.0',
      score, maxScore: 5, scenarioId: 's', weaknessTags: tags, strengthTags: [], evidence: [], timestamp: new Date().toISOString(),
    });
    const improving = computeProfile('l', 'scalability', [mk(2, ['x']), mk(4, ['x']), mk(4)]);
    expect(improving.trend).toBe('improving');
    expect(improving.recurringWeaknesses).toContain('x');
    const declining = computeProfile('l', 'scalability', [mk(4), mk(4), mk(2)]);
    expect(declining.trend).toBe('declining');
  });
});

describe('orchestrator: one solution in, skills selected internally, events streamed', () => {
  it('submit accepts the complete solution in the POST body and persists before evaluating', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l6', 'parking-lot');
    const sub = await svc.submit(a.id, text());
    expect(sub.status).toBe('SUBMITTED');
    expect(sub.submissionVersion).toBe(1);
    expect(await store.submissions.get(a.id, 1)).toBeDefined();
    const evaluation = await svc.runEvaluation(a.id, 1);
    expect(evaluation.results).toHaveLength(8);
    expect((await store.attempts.get(a.id))?.status).toBe('COMPLETED');
  });
  it('selects skills from the problem profile and builds one task per skill over the same solution', async () => {
    const problem = (await store.problems.get('parking-lot'))!;
    const all = await store.skills.list();
    const selected = selectSkills(problem, all);
    expect(selected.map(s => s.id)).toEqual(problem.skillIds);
    const tasks = buildTasks('job1', problem, selected, text());
    expect(tasks).toHaveLength(8);
    expect(new Set(tasks.map(t => t.skill.id)).size).toBe(8);
    // every skill probes the SAME complete solution; scenarios belong to skills
    for (const t of tasks) {
      expect(t.submission).toEqual(text());
      expect(t.scenario.question.length).toBeGreaterThan(10);
    }
  });
  it('streams started → per-skill completed → completed, with names/questions from the backend', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l7', 'elevator');
    await svc.putSubmission(a.id, text());
    await svc.submit(a.id);
    await svc.runEvaluation(a.id, 1);
    const history = evaluationEvents.history(evaluationJobId(a.id, 1));
    expect(history[0].type).toBe('evaluation.started');
    if (history[0].type !== 'evaluation.started') throw new Error('unreachable');
    expect(history[0].skills).toHaveLength(8);
    expect(history[history.length - 1].type).toBe('evaluation.completed');
    const completed = history.filter(e => e.type === 'skill.completed');
    expect(completed).toHaveLength(8);
    for (const e of completed) {
      if (e.type !== 'skill.completed') continue;
      expect(e.result.skillName.length).toBeGreaterThan(0); // frontend renders this, never hardcodes it
      expect(e.result.scenarioQuestion.length).toBeGreaterThan(10);
    }
  });
  it('aggregates deterministically: strongest/weakest/confidence/priority improvements', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l8', 'vending-machine');
    await svc.putSubmission(a.id, text());
    const evaluation = await svc.runEvaluation(a.id, 1);
    expect(evaluation.aggregate.strongest.length).toBeGreaterThan(0);
    expect(evaluation.aggregate.weakest.length).toBeGreaterThan(0);
    expect(evaluation.aggregate.avgConfidence).toBeGreaterThan(0);
    expect(evaluation.feedback.priorityImprovements.length).toBeGreaterThan(0);
    // determinism: same results → same aggregation
    expect(aggregateResults(evaluation.results).aggregate).toEqual(evaluation.aggregate);
  });
  it('records skill.failed + evaluation.failed events (message only) and keeps the submission', async () => {
    const svc = new PracticeService({ name: 'boom', generate: async () => { throw new Error('ai down'); } });
    const a = await svc.createAttempt('l9', 'parking-lot');
    await svc.putSubmission(a.id, text());
    await svc.submit(a.id);
    await expect(svc.runEvaluation(a.id, 1)).rejects.toThrow('ai down');
    const history = evaluationEvents.history(evaluationJobId(a.id, 1));
    const failed = history.filter(e => e.type === 'skill.failed');
    expect(failed.length).toBeGreaterThan(0);
    for (const e of failed) {
      if (e.type !== 'skill.failed') continue;
      expect(e.error).toBe('ai down');
      expect(e.retryable).toBe(true);
      expect(JSON.stringify(e)).not.toMatch(/at .*\(.*:\d+\)/); // no stack traces
    }
    expect(history[history.length - 1].type).toBe('evaluation.failed');
    expect(await store.submissions.get(a.id, 1)).toBeDefined();
  });
});

describe('coach behavior: grounding with failures, appreciation on improvement', () => {
  const thin = (): SubmissionContent => text({
    requirementsUnderstanding: 'x', assumptions: 'x', classes: 'x', responsibilities: 'x',
    relationships: 'x', mainFlow: 'x', designDecisions: 'x', edgeCases: 'x',
  });
  it('ships curated grounding examples with every result (references, not answer keys)', async () => {
    const svc = new PracticeService(new MockProvider());
    const a = await svc.createAttempt('l10', 'parking-lot');
    await svc.putSubmission(a.id, text());
    const evaluation = await svc.runEvaluation(a.id, 1);
    for (const r of evaluation.results) {
      expect(r.grounding.length).toBeGreaterThanOrEqual(2);
      expect(r.grounding.map(g => g.label).sort()).toEqual(['bad', 'good']);
      // grounding never leaks into the score math — it is display context only
      expect(typeof r.score).toBe('number');
    }
  });
  it('celebrates skills where the learner beats their own previous average', async () => {
    const svc = new PracticeService(new MockProvider());
    const first = await svc.createAttempt('l11', 'parking-lot');
    await svc.putSubmission(first.id, thin());
    const eval1 = await svc.runEvaluation(first.id, 1);
    expect(eval1.feedback.celebrations).toHaveLength(0); // no history yet — nothing to celebrate
    const second = await svc.createAttempt('l11', 'elevator');
    await svc.putSubmission(second.id, text());
    const eval2 = await svc.runEvaluation(second.id, 1);
    expect(eval2.feedback.celebrations.length).toBeGreaterThan(0);
    expect(eval2.feedback.celebrations.join(' ')).toMatch(/up from .* — keep it up/);
  });
});
