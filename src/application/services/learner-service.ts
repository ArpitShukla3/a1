import {
  Attempt,
  LearnerSkillProfile,
  SkillObservation,
} from '../../domain/models.js';
import {
  AttemptRepository,
  LearnerSkillProfileRepository,
} from '../../domain/repositories.js';
import { HttpError } from './attempt-service.js';

export class LearnerService {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly learnerProfiles: LearnerSkillProfileRepository,
  ) {}

  async getLearnerAttempts(learnerId: string): Promise<Attempt[]> {
    return this.attempts.findByLearnerId(learnerId);
  }

  async getLearnerSkills(learnerId: string): Promise<LearnerSkillProfile[]> {
    return this.learnerProfiles.findByLearnerId(learnerId);
  }

  async getLearnerSkillProfile(
    learnerId: string,
    skillId: string,
  ): Promise<LearnerSkillProfile> {
    const profile = await this.learnerProfiles.findOrCreate(learnerId, skillId);
    if (!profile) throw new HttpError(404, 'Skill profile not found');
    return profile;
  }

  async recordObservation(
    learnerId: string,
    observation: SkillObservation,
  ): Promise<void> {
    const profile = await this.learnerProfiles.findOrCreate(
      learnerId,
      observation.skillId,
    );
    profile.observations.push(observation);
    applyAggregations(profile);
    await this.learnerProfiles.update(profile);
  }
}

export function applyAggregations(profile: LearnerSkillProfile): void {
  const observations = profile.observations;
  const normalized = observations.map((o) =>
    o.maxScore > 0 ? o.score / o.maxScore : 0,
  );

  profile.averageScore =
    normalized.reduce((a, b) => a + b, 0) / Math.max(1, normalized.length);

  const recentCount = Math.min(3, normalized.length);
  const recent = normalized.slice(-recentCount);
  profile.recentAverage =
    recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);

  if (normalized.length <= 1) {
    profile.trend = 0;
  } else {
    const recentWindow = normalized.slice(-Math.ceil(normalized.length / 2));
    const earlierWindow = normalized.slice(0, -Math.ceil(normalized.length / 2));
    const recentAvg = avg(recentWindow);
    const earlierAvg = avg(earlierWindow);
    profile.trend = Number((recentAvg - earlierAvg).toFixed(3));
  }

  profile.recurringWeaknesses = recurringTags(observations, 'weaknessTags');
  profile.recurringStrengths = recurringTags(observations, 'strengthTags');
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function recurringTags(
  observations: SkillObservation[],
  key: 'weaknessTags' | 'strengthTags',
): string[] {
  const counts = new Map<string, number>();
  for (const obs of observations) {
    for (const tag of obs[key]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([tag]) => tag)
    .sort();
}