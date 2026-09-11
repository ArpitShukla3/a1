import express from 'express';
import { loadConfig } from './infrastructure/config.js';
import { createProvider } from './infrastructure/providers/index.js';
import { LLMEvaluator, EvaluationRunner } from './application/evaluator/runner.js';
import { SKILLS } from './application/evaluator/skills.js';
import { PROBLEMS } from './seeds/problems.js';
import {
  InMemoryProblemRepository,
  InMemoryAttemptRepository,
  InMemorySubmissionRepository,
  InMemoryEvaluationRepository,
  InMemorySkillRepository,
  InMemoryLearnerSkillProfileRepository,
} from './infrastructure/repositories/in-memory.js';
import { AttemptService } from './application/services/attempt-service.js';
import { SubmissionService } from './application/services/submission-service.js';
import { EvaluationService } from './application/services/evaluation-service.js';
import { LearnerService } from './application/services/learner-service.js';
import { createRouter } from './api/routes.js';

export function buildApp(config = loadConfig()) {
  const problemRepo = new InMemoryProblemRepository(new Map(PROBLEMS.map((p) => [p.id, p])));
  const skillRepo = new InMemorySkillRepository(new Map(SKILLS.map((s) => [s.id, s])));
  const attemptRepo = new InMemoryAttemptRepository();
  const submissionRepo = new InMemorySubmissionRepository();
  const evaluationRepo = new InMemoryEvaluationRepository();
  const learnerProfileRepo = new InMemoryLearnerSkillProfileRepository();

  const provider = createProvider(config);
  const evaluator = new LLMEvaluator(provider);
  const runner = new EvaluationRunner(evaluator);

  const attempts = new AttemptService(attemptRepo, problemRepo);
  const learners = new LearnerService(attemptRepo, learnerProfileRepo);
  const evaluations = new EvaluationService(
    attemptRepo,
    submissionRepo,
    evaluationRepo,
    skillRepo,
    problemRepo,
    learnerProfileRepo,
    runner,
    learners,
  );
  const submissions = new SubmissionService(attemptRepo, submissionRepo, evaluations);

  const app = express();
  app.use(express.json());
  app.use('/api', createRouter(problemRepo, attempts, submissions, evaluations, learners));
  app.get('/health', (_req, res) => res.json({ status: 'ok', provider: config.provider }));

  return { app, config };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, config } = buildApp();
  app.listen(config.port, () => {
    if (config.provider === 'mock') {
      console.log(`\n  LLD Practice API running on :${config.port} (AI_PROVIDER=mock, offline demo)\n`);
    } else {
      console.log(`\n  LLD Practice API running on :${config.port} (AI_PROVIDER=${config.provider})\n`);
    }
  });
}