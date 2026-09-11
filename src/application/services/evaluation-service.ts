import crypto from 'node:crypto';
import {
  Attempt,
  Evaluation,
  EvaluationTask,
  SkillObservation,
} from '../../domain/models.js';
import {
  AttemptRepository,
  EvaluationRepository,
  LearnerSkillProfileRepository,
  ProblemRepository,
  SkillRepository,
  SubmissionRepository,
} from '../../domain/repositories.js';
import { HttpError } from './attempt-service.js';
import { EvaluationRunner, evaluationJobId } from '../evaluator/runner.js';
import { LearnerService } from './learner-service.js';

export class EvaluationService {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly submissions: SubmissionRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly skills: SkillRepository,
    private readonly problems: ProblemRepository,
    private readonly learnerProfiles: LearnerSkillProfileRepository,
    private readonly runner: EvaluationRunner,
    private readonly learners: LearnerService,
  ) {}

  async triggerEvaluation(attemptId: string): Promise<{ attempt: string; evaluationJobId: string }> {
    const attempt = await this.attempts.findById(attemptId);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    const submission = attempt.submission;
    if (!submission) throw new HttpError(400, 'No submission to evaluate');

    const jobId = evaluationJobId(attempt.id, submission.version);

    let evaluation = await this.evaluations.findByJobId(jobId);
    if (evaluation && evaluation.status !== 'FAILED') {
      return { attempt: attempt.id, evaluationJobId: jobId };
    }

    if (!evaluation) {
      evaluation = await this.evaluations.create({
        id: crypto.randomUUID(),
        attemptId: attempt.id,
        submissionVersion: submission.version,
        jobId,
        status: 'PENDING',
        skillResults: [],
        aggregateScore: 0,
        createdAt: new Date(),
      });
    }

    setImmediate(() => this.runEvaluation(attempt.id, evaluation.id));
    return { attempt: attempt.id, evaluationJobId: jobId };
  }

  async runEvaluation(attemptId: string, evaluationId: string): Promise<void> {
    const [attempt, evaluation] = await Promise.all([
      this.attempts.findById(attemptId),
      this.evaluations.findById(evaluationId),
    ]);
    if (!attempt || !evaluation) return;

    attempt.status = 'EVALUATING';
    attempt.evaluationId = evaluation.id;
    await this.attempts.update(attempt);

    evaluation.status = 'RUNNING';
    await this.evaluations.update(evaluation);

    try {
      const submission = attempt.submission;
      if (!submission) throw new Error('Submission missing during evaluation');

      const problem = await this.problems.findById(attempt.problemId);
      if (!problem) throw new Error('Problem not found');

      const skillIds = problem.evaluationProfile.skillIds;
      const skills = await this.skills.findByIds(skillIds);

      const tasks: EvaluationTask[] = skills.map((skill) => {
        const scenario = skill.scenarios[0];
        if (!scenario) throw new Error(`Skill ${skill.id} has no scenarios`);
        return {
          taskId: `${evaluation.jobId}_${skill.id}`,
          skill,
          scenario,
          groundingExamples: skill.groundingExamples,
          submissionContent: submission.content,
          problemContext: {
            title: problem.title,
            description: problem.description,
            requirements: problem.requirements,
            constraints: problem.constraints,
          },
        };
      });

      const skillResults = await this.runner.runAll(tasks);

      evaluation.skillResults = skillResults;
      evaluation.aggregateScore =
        skillResults.reduce((sum, r) => sum + r.score, 0) / skillResults.length;
      evaluation.status = 'COMPLETED';
      evaluation.completedAt = new Date();
      await this.evaluations.update(evaluation);

      attempt.status = 'COMPLETED';
      await this.attempts.update(attempt);

      await this.storeObservations(attempt, problem.id, skillResults);
    } catch (err) {
      evaluation.status = 'FAILED';
      evaluation.error = err instanceof Error ? err.message : String(err);
      await this.evaluations.update(evaluation);

      attempt.status = 'FAILED';
      await this.attempts.update(attempt);
    }
  }

  async retryEvaluation(attemptId: string): Promise<{ attempt: string; evaluationJobId: string }> {
    const attempt = await this.attempts.findById(attemptId);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    if (!attempt.submission) throw new HttpError(400, 'No submission to evaluate');
    if (attempt.status !== 'FAILED') {
      throw new HttpError(409, `Only FAILED attempts can be retried (current: ${attempt.status})`);
    }

    const jobId = evaluationJobId(attempt.id, attempt.submission.version);
    const existing = await this.evaluations.findByJobId(jobId);
    if (existing && existing.status === 'FAILED') {
      existing.status = 'PENDING';
      existing.skillResults = [];
      existing.error = undefined;
      existing.completedAt = undefined;
      await this.evaluations.update(existing);
      setImmediate(() => this.runEvaluation(attempt.id, existing.id));
      return { attempt: attempt.id, evaluationJobId: jobId };
    }

    return this.triggerEvaluation(attemptId);
  }

  async getEvaluation(attemptId: string): Promise<Evaluation> {
    const attempt = await this.attempts.findById(attemptId);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    const evaluation = await this.evaluations.findByAttemptId(attemptId);
    if (!evaluation) throw new HttpError(404, 'No evaluation for this attempt');
    return evaluation;
  }

  private async storeObservations(
    attempt: Attempt,
    problemId: string,
    results: Evaluation['skillResults'],
  ): Promise<void> {
    for (const r of results) {
      const observation: SkillObservation = {
        attemptId: attempt.id,
        problemId,
        skillId: r.skillId,
        skillVersion: r.skillVersion,
        score: r.score,
        maxScore: r.maxScore,
        scenarioId: r.scenarioId,
        weaknessTags: r.weaknessTags,
        strengthTags: r.strengthTags,
        evidence: r.evidence,
        timestamp: new Date(),
      };
      await this.learners.recordObservation(attempt.learnerId, observation);
    }
  }
}