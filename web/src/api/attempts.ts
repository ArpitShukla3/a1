import { get, post, put } from './client.js';
import type { Attempt, SolutionSubmissionContent } from '../types.js';
import { LEARNER_ID } from '../types.js';

export const createAttempt = (problemId: string, learnerId = LEARNER_ID): Promise<Attempt> =>
  post<Attempt>('/api/attempts', { learnerId, problemId });

export const getAttempt = (id: string): Promise<Attempt> => get<Attempt>(`/api/attempts/${id}`);

export const saveSubmission = (id: string, content: SolutionSubmissionContent): Promise<Attempt> =>
  put<Attempt>(`/api/attempts/${id}/submission`, content);

// Single submission/evaluation entry point: the complete solution travels in the
// POST body; the backend validates, persists, selects skills, and evaluates.
export const submitAttempt = (id: string, solution?: SolutionSubmissionContent): Promise<Attempt> =>
  post<Attempt>(`/api/attempts/${id}/submit`, solution === undefined ? undefined : { solution });

export const retryEvaluation = (id: string): Promise<unknown> =>
  post(`/api/attempts/${id}/retry-evaluation`);

export const listLearnerAttempts = (learnerId = LEARNER_ID): Promise<Attempt[]> =>
  get<Attempt[]>(`/api/learners/${learnerId}/attempts`);
