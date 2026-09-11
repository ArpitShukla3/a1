// Domain model + clean interfaces. Application layer depends only on these.

export type AttemptStatus = 'DRAFT' | 'SUBMITTED' | 'EVALUATING' | 'COMPLETED' | 'FAILED';

// ponytail: union with index signature so Diagram/Code submissions extend without rewriting Attempt/Evaluation.
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
export type SubmissionContent = TextSubmissionContent | SolutionSubmissionContent | { kind: string; [k: string]: unknown };

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
  submission?: SubmissionContent;
  evaluationJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  attemptId: string;
  version: number;
  content: SubmissionContent;
  createdAt: string;
}

export interface Evidence { candidateExcerpt: string; observation: string; }

export interface SkillEvaluationResult {
  skillId: string;
  skillVersion: string;
  skillName: string; // backend-owned display data, so the frontend never hardcodes skill config
  scenarioId: string;
  scenarioQuestion: string; // the probe text — an evaluator artifact, not a learner input
  score: number;
  maxScore: number;
  confidence: number;
  evidence: Evidence[];
  strengths: string[];
  concerns: string[];
  suggestions: string[];
  weaknessTags: string[];
  strengthTags: string[];
  grounding: GroundingExample[]; // curated skill references shipped with the result, so every
  // concern can be shown next to a concrete "where designs like this fail" example
}

export interface Evaluation {
  id: string; // == evaluationJobId (deterministic)
  attemptId: string;
  submissionVersion: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  results: SkillEvaluationResult[];
  aggregate: {
    totalScore: number; maxTotal: number; average: number;
    strongest: string[]; weakest: string[]; avgConfidence: number; // deterministic, equal weights (MVP)
  };
  feedback: Feedback;
  error?: string;
  createdAt: string;
}

export interface Feedback {
  summary: string;
  strengths: string[];
  improvements: string[];
  priorityImprovements: string[]; // suggestions from the weakest skills first
  celebrations: string[]; // skills where the learner beat their own previous average
  bySkill: { skillId: string; score: number; maxScore: number; suggestions: string[] }[];
}

export interface Criterion { id: string; description: string; }
export interface Scenario { id: string; question: string; }
export interface GroundingExample { label: 'good' | 'bad'; pattern: string; explanation: string; }

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  criteria: Criterion[];
  scenarios: Scenario[];
  groundingExamples: GroundingExample[];
  maxScore: number;
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

// ---- Repository interfaces ----
export interface ProblemRepository { list(): Promise<Problem[]>; get(id: string): Promise<Problem | undefined>; }
export interface AttemptRepository {
  create(a: Attempt): Promise<Attempt>;
  get(id: string): Promise<Attempt | undefined>;
  update(a: Attempt): Promise<Attempt>;
  listByLearner(learnerId: string): Promise<Attempt[]>;
}
export interface SubmissionRepository {
  save(s: Submission): Promise<Submission>;
  get(attemptId: string, version: number): Promise<Submission | undefined>;
  latest(attemptId: string): Promise<Submission | undefined>;
}
export interface EvaluationRepository {
  save(e: Evaluation): Promise<Evaluation>;
  get(id: string): Promise<Evaluation | undefined>;
  getByAttempt(attemptId: string): Promise<Evaluation | undefined>;
}
export interface SkillRepository { list(): Promise<Skill[]>; get(id: string): Promise<Skill | undefined>; }
export interface LearnerSkillProfileRepository {
  addObservation(o: SkillObservation): Promise<void>;
  observations(learnerId: string, skillId?: string): Promise<SkillObservation[]>;
}

// ---- AI abstractions (domain never knows the provider) ----
export interface EvaluationTask {
  taskId: string; // deterministic: `${attemptId}:v${version}:${skillId}`
  skill: Skill;
  scenario: Scenario;
  problem: Problem;
  submission: SubmissionContent;
}
export interface Evaluator { evaluate(task: EvaluationTask, onToken?: (token: string) => void): Promise<SkillEvaluationResult>; }
export interface LLMProvider { name: string; generate(prompt: string, onToken?: (token: string) => void): Promise<string>; }

export function evaluationJobId(attemptId: string, version: number): string {
  return `${attemptId}:v${version}`;
}

// ---- Evaluation stream events (SSE payloads: real state only, no stack traces, no provider internals) ----
export interface EvalSkillRef { skillId: string; skillName: string; }
export type EvalEvent =
  | { type: 'evaluation.started'; jobId: string; attemptId: string; skills: EvalSkillRef[] }
  | { type: 'skill.started'; jobId: string; skillId: string; skillName: string }
  | { type: 'skill.token'; jobId: string; skillId: string; token: string }
  | { type: 'skill.completed'; jobId: string; skillId: string; result: SkillEvaluationResult }
  | { type: 'skill.failed'; jobId: string; skillId: string; error: string; retryable: boolean }
  | { type: 'evaluation.completed'; jobId: string; evaluation: Evaluation }
  | { type: 'evaluation.failed'; jobId: string; error: string; retryable: boolean };

export interface EvaluationEventPublisher {
  publish(e: EvalEvent): void;
  history(jobId: string): EvalEvent[]; // replay log for late subscribers / reconnects
  subscribe(jobId: string, fn: (e: EvalEvent) => void): () => void;
}
