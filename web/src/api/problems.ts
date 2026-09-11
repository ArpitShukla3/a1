import { get } from './client.js';
import type { Problem } from '../types.js';

export const listProblems = (): Promise<Problem[]> => get<Problem[]>('/api/problems');
export const getProblem = (id: string): Promise<Problem> => get<Problem>(`/api/problems/${id}`);
