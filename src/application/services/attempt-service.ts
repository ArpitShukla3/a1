import crypto from 'node:crypto';
import { Attempt } from '../../domain/models.js';
import { AttemptRepository, ProblemRepository } from '../../domain/repositories.js';

export class AttemptService {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly problems: ProblemRepository,
  ) {}

  async createAttempt(problemId: string, learnerId: string): Promise<Attempt> {
    const problem = await this.problems.findById(problemId);
    if (!problem) throw new HttpError(404, 'Problem not found');

    const attempt: Attempt = {
      id: crypto.randomUUID(),
      problemId,
      learnerId,
      status: 'DRAFT',
      submissionVersion: 0,
      createdAt: new Date(),
    };
    return this.attempts.create(attempt);
  }

  async getAttempt(id: string): Promise<Attempt> {
    const attempt = await this.attempts.findById(id);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    return attempt;
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}