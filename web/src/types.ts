// Mirror of backend response models. All data comes from the API at runtime.
export type AttemptStatus = 'DRAFT' | 'SUBMITTED' | 'EVALUATING' | 'COMPLETED' | 'FAILED';

export interface TextSubmissionContent {
  kind: 'text';
  requirementsUnderstanding: string;
  assumptions: string;
  classes: string;
  responsibilities: string;
  relationships: string;
  mainFlow: string;
  designDecisions: string;
  edgeCases: string;
}

export interface SolutionSubmissionContent {
  kind: 'solution';
  solution: string;
}

export interface Problem {
  id: string;
  title: string;
  requirements: string[];
  constraints: string[];
  assumptions: string[];
  skillIds: string[];
}

export interface Attempt {
  id: string;
  learnerId: string;
  problemId: string;
  status: AttemptStatus;
  submissionVersion: number;
  submission?: TextSubmissionContent | SolutionSubmissionContent;
  evaluationJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence { candidateExcerpt: string; observation: string; }

export interface SkillEvaluationResult {
  skillId: string;
  skillVersion: string;
  skillName: string;
  scenarioId: string;
  scenarioQuestion: string;
  score: number;
  maxScore: number;
  confidence: number;
  evidence: Evidence[];
  strengths: string[];
  concerns: string[];
  suggestions: string[];
  weaknessTags: string[];
  strengthTags: string[];
  grounding: { label: 'good' | 'bad'; pattern: string; explanation: string }[];
}

export interface Evaluation {
  id: string;
  attemptId: string;
  submissionVersion: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  results: SkillEvaluationResult[];
  aggregate: {
    totalScore: number; maxTotal: number; average: number;
    strongest: string[]; weakest: string[]; avgConfidence: number;
  };
  feedback: {
    summary: string;
    strengths: string[];
    improvements: string[];
    priorityImprovements: string[];
    celebrations: string[];
    bySkill: { skillId: string; score: number; maxScore: number; suggestions: string[] }[];
  };
  error?: string;
  createdAt: string;
}

export interface LearnerSkillProfile {
  learnerId: string;
  skillId: string;
  count: number;
  average: number;
  recentAverage: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient-data';
  recurringWeaknesses: string[];
  recurringStrengths: string[];
}

export interface SkillObservation {
  learnerId: string;
  attemptId: string;
  problemId: string;
  skillId: string;
  skillVersion: string;
  score: number;
  maxScore: number;
  scenarioId: string;
  weaknessTags: string[];
  strengthTags: string[];
  evidence: Evidence[];
  timestamp: string;
}

export const LEARNER_ID = 'demo-user';

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
}

// Stream events from GET /api/attempts/:id/evaluation-events. Real state only.
export type EvalStreamEvent =
  | { type: 'evaluation.started'; jobId: string; attemptId: string; skills: { skillId: string; skillName: string }[] }
  | { type: 'skill.started'; jobId: string; skillId: string; skillName: string }
  | { type: 'skill.token'; jobId: string; skillId: string; token: string }
  | { type: 'skill.completed'; jobId: string; skillId: string; result: SkillEvaluationResult }
  | { type: 'skill.failed'; jobId: string; skillId: string; error: string; retryable: boolean }
  | { type: 'evaluation.completed'; jobId: string; evaluation: Evaluation }
  | { type: 'evaluation.failed'; jobId: string; error: string; retryable: boolean };

// Editorial "why it matters" copy for the UI. Skill names, scenarios, and all
// scores/evidence come from the API — the frontend holds no evaluation config.
export const SKILL_WHY: Record<string, string> = {
  requirement_understanding: 'A design that misses the actual requirements solves the wrong problem, no matter how clean the classes look.',
  responsibility_design: 'Every behavior needs exactly one owner. Shared or homeless responsibilities become god objects and merge conflicts.',
  coupling_cohesion: 'Tightly coupled modules ripple every change across the codebase; cohesive ones can evolve independently.',
  abstraction_encapsulation: 'Seams at variation points let implementations change without callers caring; leaked internals freeze the design.',
  extensibility: 'Real systems grow new variants constantly. Extension without core edits is the difference between a day and a sprint.',
  scalability: 'A design that works for one machine can collapse under contention, single locks, or full scans at scale.',
  failure_handling: 'Partial failures are the norm. Without compensation or idempotent retries, halfway states corrupt data.',
  edge_cases_testability: 'Untestable logic is unverifiable logic. Edge cases found in production are outages; found in design, they are footnotes.',
};

// Last-resort label when the skill catalog hasn't loaded yet.
export function skillName(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
