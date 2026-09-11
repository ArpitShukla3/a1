import { get } from './client.js';
import type { LearnerSkillProfile, SkillMeta, SkillObservation } from '../types.js';
import { LEARNER_ID } from '../types.js';

// Learner-facing skill catalog (id/name/description). Prompts, scenarios, and
// grounding stay backend-only; this is just display metadata.
export const listSkills = (): Promise<SkillMeta[]> => get<SkillMeta[]>('/api/skills');

export const listSkillProfiles = (learnerId = LEARNER_ID): Promise<LearnerSkillProfile[]> =>
  get<LearnerSkillProfile[]>(`/api/learners/${learnerId}/skills`);

export const getSkillDetail = (
  skillId: string,
  learnerId = LEARNER_ID,
): Promise<{ profile: LearnerSkillProfile; observations: SkillObservation[] }> =>
  get(`/api/learners/${learnerId}/skills/${skillId}`);
