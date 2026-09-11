import {
  Submission,
  SubmissionContent,
} from '../../domain/models.js';
import {
  AttemptRepository,
  SubmissionRepository,
} from '../../domain/repositories.js';
import { HttpError } from './attempt-service.js';
import { EvaluationService } from './evaluation-service.js';

const REQUIRED_FIELDS: (keyof SubmissionContent)[] = [
  'requirementsUnderstanding',
  'assumptions',
  'classes',
  'responsibilities',
  'relationships',
  'mainFlow',
  'designDecisions',
  'edgeCases',
];

export class SubmissionService {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly submissions: SubmissionRepository,
    private readonly evaluations: EvaluationService,
  ) {}

  async saveSubmission(
    attemptId: string,
    content: SubmissionContent,
  ): Promise<Submission> {
    validateContent(content);

    const attempt = await this.attempts.findById(attemptId);
    if (!attempt) throw new HttpError(404, 'Attempt not found');
    if (attempt.status !== 'DRAFT') {
      throw new HttpError(
        409,
        `Cannot update submission in status ${attempt.status}. Create a new attempt.`,
      );
    }

    const version = (attempt.submissionVersion ?? 0) + 1;
    const submission: Submission = {
      version,
      content: { type: 'structured_text', ...content },
      submittedAt: new Date(),
    };
    const saved = await this.submissions.save(attemptId, submission);

    attempt.submission = saved;
    attempt.submissionVersion = version;
    await this.attempts.update(attempt);
    return saved;
  }

  async submit(attemptId: string): Promise<{ attempt: string; evaluationJobId: string }> {
    const attempt = await this.attempts.findById(attemptId);
    if (!attempt) throw new HttpError(404, 'Attempt not found');

    if (attempt.status === 'DRAFT' && !attempt.submission) {
      throw new HttpError(400, 'No submission saved for this attempt');
    }
    if (attempt.status === 'DRAFT') {
      attempt.status = 'SUBMITTED';
      await this.attempts.update(attempt);
    }

    return this.evaluations.triggerEvaluation(attempt.id);
  }
}

export function validateContent(content: SubmissionContent): void {
  if (!content || typeof content !== 'object') {
    throw new HttpError(400, 'Submission content is required');
  }
  for (const field of REQUIRED_FIELDS) {
    const value = content[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new HttpError(400, `Field "${field}" is required and must be non-empty`);
    }
  }
}