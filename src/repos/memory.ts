import type { Attempt, Evaluation, Problem, Skill, SkillObservation, Submission } from '../domain/types.js';
import { PROBLEMS } from '../data/problems.js';
import { SKILLS } from '../data/skills.js';

// ponytail: one file, all in-memory repos — no DB for MVP.
export class InMemoryProblemRepository {
  async list(): Promise<Problem[]> { return PROBLEMS; }
  async get(id: string): Promise<Problem | undefined> { return PROBLEMS.find(p => p.id === id); }
}
export class InMemorySkillRepository {
  async list(): Promise<Skill[]> { return SKILLS; }
  async get(id: string): Promise<Skill | undefined> { return SKILLS.find(s => s.id === id); }
}
export class InMemoryAttemptRepository {
  private m = new Map<string, Attempt>();
  async create(a: Attempt): Promise<Attempt> { this.m.set(a.id, a); return a; }
  async get(id: string): Promise<Attempt | undefined> { return this.m.get(id); }
  async update(a: Attempt): Promise<Attempt> { this.m.set(a.id, a); return a; }
  async listByLearner(learnerId: string): Promise<Attempt[]> {
    return [...this.m.values()].filter(a => a.learnerId === learnerId);
  }
}
export class InMemorySubmissionRepository {
  private m = new Map<string, Submission>();
  async save(s: Submission): Promise<Submission> { this.m.set(`${s.attemptId}:v${s.version}`, s); return s; }
  async get(attemptId: string, version: number): Promise<Submission | undefined> {
    return this.m.get(`${attemptId}:v${version}`);
  }
  async latest(attemptId: string): Promise<Submission | undefined> {
    const all = [...this.m.values()].filter(s => s.attemptId === attemptId).sort((a, b) => b.version - a.version);
    return all[0];
  }
}
export class InMemoryEvaluationRepository {
  private m = new Map<string, Evaluation>();
  async save(e: Evaluation): Promise<Evaluation> { this.m.set(e.id, e); return e; }
  async get(id: string): Promise<Evaluation | undefined> { return this.m.get(id); }
  async getByAttempt(attemptId: string): Promise<Evaluation | undefined> {
    const all = [...this.m.values()].filter(e => e.attemptId === attemptId)
      .sort((a, b) => b.submissionVersion - a.submissionVersion);
    return all[0];
  }
}
export class InMemoryLearnerSkillProfileRepository {
  private obs: SkillObservation[] = [];
  async addObservation(o: SkillObservation): Promise<void> { this.obs.push(o); }
  async observations(learnerId: string, skillId?: string): Promise<SkillObservation[]> {
    return this.obs.filter(o => o.learnerId === learnerId && (!skillId || o.skillId === skillId))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
