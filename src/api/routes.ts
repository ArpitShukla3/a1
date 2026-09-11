import { Router, Request, Response, NextFunction } from 'express';
import { AttemptService, HttpError } from '../application/services/attempt-service.js';
import { SubmissionService } from '../application/services/submission-service.js';
import { EvaluationService } from '../application/services/evaluation-service.js';
import { LearnerService } from '../application/services/learner-service.js';
import { ProblemRepository } from '../domain/repositories.js';
import { SubmissionContent } from '../domain/models.js';

export function createRouter(
  problems: ProblemRepository,
  attempts: AttemptService,
  submissions: SubmissionService,
  evaluations: EvaluationService,
  learners: LearnerService,
): Router {
  const r = Router();

  // ─── Problems ───────────────────────────────────────────────────────────────
  r.get('/problems', async (_req, res) => {
    const list = await problems.findAll();
    res.json(list);
  });

  r.get('/problems/:id', async (req, res) => {
    const p = await problems.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Problem not found' });
    res.json(p);
  });

  // ─── Attempts ───────────────────────────────────────────────────────────────
  r.post('/attempts', async (req, res, next) => {
    try {
      const { problemId, learnerId } = req.body;
      if (!problemId || !learnerId)
        return res.status(400).json({ error: 'problemId and learnerId are required' });
      const attempt = await attempts.createAttempt(problemId, learnerId);
      res.status(201).json(attempt);
    } catch (e) {
      next(e);
    }
  });

  r.get('/attempts/:id', async (req, res, next) => {
    try {
      res.json(await attempts.getAttempt(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  // ─── Submission ─────────────────────────────────────────────────────────────
  r.put('/attempts/:id/submission', async (req, res, next) => {
    try {
      const content: SubmissionContent = req.body;
      const sub = await submissions.saveSubmission(req.params.id, content);
      res.json(sub);
    } catch (e) {
      next(e);
    }
  });

  r.post('/attempts/:id/submit', async (req, res, next) => {
    try {
      const result = await submissions.submit(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // ─── Evaluation ─────────────────────────────────────────────────────────────
  r.get('/attempts/:id/evaluation', async (req, res, next) => {
    try {
      res.json(await evaluations.getEvaluation(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  r.post('/attempts/:id/retry-evaluation', async (req, res, next) => {
    try {
      const result = await evaluations.retryEvaluation(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // ─── Learners ───────────────────────────────────────────────────────────────
  r.get('/learners/:id/attempts', async (req, res, next) => {
    try {
      res.json(await learners.getLearnerAttempts(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  r.get('/learners/:id/skills', async (req, res, next) => {
    try {
      res.json(await learners.getLearnerSkills(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  r.get('/learners/:id/skills/:skillId', async (req, res, next) => {
    try {
      const profile = await learners.getLearnerSkillProfile(req.params.id, req.params.skillId);
      res.json(profile);
    } catch (e) {
      next(e);
    }
  });

  // ─── Error handler ──────────────────────────────────────────────────────────
  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[API] ${message}`);
    res.status(status).json({ error: message });
  });

  return r;
}