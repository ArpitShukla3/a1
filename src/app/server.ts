import 'dotenv/config';
import express from 'express';
import { PracticeService, computeProfile, evaluationEvents, store } from './service.js';
import { isTerminal } from '../ai/orchestrator.js';
import { evaluationJobId, type EvalEvent } from '../domain/types.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
const svc = new PracticeService();
const err = (e: unknown, res: express.Response) => {
  const s = (e as { status?: number })?.status ?? 500;
  res.status(s).json({ error: (e as Error).message });
};

app.get('/api/problems', async (_req, res) => res.json(await store.problems.list()));
app.get('/api/problems/:id', async (req, res) => {
  const p = await store.problems.get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'not found' });
});
app.post('/api/attempts', async (req, res) => {
  try { res.status(201).json(await svc.createAttempt(req.body.learnerId, req.body.problemId)); }
  catch (e) { err(e, res); }
});
app.get('/api/attempts/:id', async (req, res) => {
  const a = await store.attempts.get(req.params.id);
  a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
app.put('/api/attempts/:id/submission', async (req, res) => {
  try { res.json(await svc.putSubmission(req.params.id, req.body)); }
  catch (e) { err(e, res); }
});
app.post('/api/attempts/:id/submit', async (req, res) => {
  try { res.status(202).json(await svc.submit(req.params.id, req.body?.solution)); }
  catch (e) { err(e, res); }
});
app.get('/api/attempts/:id/evaluation', async (req, res) => {
  const e = await store.evaluations.getByAttempt(req.params.id);
  e ? res.json(e) : res.status(404).json({ error: 'no evaluation yet' });
});
// Skill catalog: learner-facing metadata (id/name/description) so the frontend
// never hardcodes skill config. Prompts, scenarios, and grounding stay backend-only.
app.get('/api/skills', async (_req, res) => {
  const skills = await store.skills.list();
  res.json(skills.map(s => ({ id: s.id, name: s.name, description: s.description })));
});
// SSE stream of evaluation events: started → skill.started/completed/failed → completed/failed.
// Replays the job's event log on connect, then stays open until a terminal event.
app.get('/api/attempts/:id/evaluation-events', async (req, res) => {
  const attempt = await store.attempts.get(req.params.id);
  if (!attempt) return res.status(404).json({ error: 'not found' });
  const jobId = attempt.evaluationJobId ?? evaluationJobId(req.params.id, attempt.submissionVersion);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (e: EvalEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  for (const e of evaluationEvents.history(jobId)) send(e);
  if (isTerminal(jobId)) return res.end();
  const unsub = evaluationEvents.subscribe(jobId, send);
  req.on('close', unsub);
});
app.post('/api/attempts/:id/retry-evaluation', async (req, res) => {
  try { res.json(await svc.retry(req.params.id)); }
  catch (e) { err(e, res); }
});
app.get('/api/learners/:id/attempts', async (req, res) => res.json(await store.attempts.listByLearner(req.params.id)));
app.get('/api/learners/:id/skills', async (req, res) => res.json(await svc.skillProfiles(req.params.id)));
app.get('/api/learners/:id/skills/:skillId', async (req, res) => {
  const obs = await store.profiles.observations(req.params.id, req.params.skillId);
  if (!obs.length) return res.status(404).json({ error: 'no data' });
  res.json({ profile: computeProfile(req.params.id, req.params.skillId, obs), observations: obs });
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.VITEST !== 'true') app.listen(port, () => console.log(`LLD backend on :${port} (AI_PROVIDER=${process.env.AI_PROVIDER ?? 'mock'})`));
export default app;
