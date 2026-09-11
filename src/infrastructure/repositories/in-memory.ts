import {
  Problem,
  Attempt,
  Submission,
  Evaluation,
  Skill,
  LearnerSkillProfile,
} from '../../domain/models.js';
import {
  ProblemRepository,
  AttemptRepository,
  SubmissionRepository,
  EvaluationRepository,
  SkillRepository,
  LearnerSkillProfileRepository,
} from '../../domain/repositories.js';

export class InMemoryProblemRepository implements ProblemRepository {
  constructor(private readonly problems = new Map<string, Problem>()) {}

  async findAll(): Promise<Problem[]> {
    return [...this.problems.values()];
  }

  async findById(id: string): Promise<Problem | null> {
    return this.problems.get(id) ?? null;
  }
}

export class InMemoryAttemptRepository implements AttemptRepository {
  private readonly attempts = new Map<string, Attempt>();

  async create(attempt: Attempt): Promise<Attempt> {
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  async findById(id: string): Promise<Attempt | null> {
    return this.attempts.get(id) ?? null;
  }

  async findByLearnerId(learnerId: string): Promise<Attempt[]> {
    return [...this.attempts.values()].filter((a) => a.learnerId === learnerId);
  }

  async update(attempt: Attempt): Promise<Attempt> {
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly submissions = new Map<string, Submission>();

  async save(attemptId: string, submission: Submission): Promise<Submission> {
    this.submissions.set(attemptId, submission);
    return submission;
  }

  async findByAttemptId(attemptId: string): Promise<Submission | null> {
    return this.submissions.get(attemptId) ?? null;
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private readonly evaluations = new Map<string, Evaluation>();
  private readonly byAttempt = new Map<string, Evaluation>();
  private readonly byJob = new Map<string, Evaluation>();

  async create(evaluation: Evaluation): Promise<Evaluation> {
    this.evaluations.set(evaluation.id, evaluation);
    this.byAttempt.set(evaluation.attemptId, evaluation);
    this.byJob.set(evaluation.jobId, evaluation);
    return evaluation;
  }

  async findById(id: string): Promise<Evaluation | null> {
    return this.evaluations.get(id) ?? null;
  }

  async findByAttemptId(attemptId: string): Promise<Evaluation | null> {
    return this.byAttempt.get(attemptId) ?? null;
  }

  async findByJobId(jobId: string): Promise<Evaluation | null> {
    return this.byJob.get(jobId) ?? null;
  }

  async update(evaluation: Evaluation): Promise<Evaluation> {
    this.evaluations.set(evaluation.id, evaluation);
    this.byAttempt.set(evaluation.attemptId, evaluation);
    this.byJob.set(evaluation.jobId, evaluation);
    return evaluation;
  }
}

export class InMemorySkillRepository implements SkillRepository {
  constructor(private readonly skills = new Map<string, Skill>()) {}

  async findAll(): Promise<Skill[]> {
    return [...this.skills.values()];
  }

  async findById(id: string): Promise<Skill | null> {
    return this.skills.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Skill[]> {
    return ids
      .map((id) => this.skills.get(id))
      .filter((s): s is Skill => s !== undefined);
  }
}

export class InMemoryLearnerSkillProfileRepository
  implements LearnerSkillProfileRepository
{
  private readonly profiles = new Map<string, LearnerSkillProfile>();

  private key(learnerId: string, skillId: string): string {
    return `${learnerId}:${skillId}`;
  }

  async findOrCreate(
    learnerId: string,
    skillId: string,
  ): Promise<LearnerSkillProfile> {
    const k = this.key(learnerId, skillId);
    let profile = this.profiles.get(k);
    if (!profile) {
      profile = {
        learnerId,
        skillId,
        observations: [],
        averageScore: 0,
        recentAverage: 0,
        trend: 0,
        recurringWeaknesses: [],
        recurringStrengths: [],
      };
      this.profiles.set(k, profile);
    }
    return profile;
  }

  async findByLearnerId(learnerId: string): Promise<LearnerSkillProfile[]> {
    return [...this.profiles.values()].filter((p) => p.learnerId === learnerId);
  }

  async update(profile: LearnerSkillProfile): Promise<LearnerSkillProfile> {
    this.profiles.set(this.key(profile.learnerId, profile.skillId), profile);
    return profile;
  }
}