# LLD Practice Platform — Backend (MVP)

Modular monolith. Node + TypeScript + Express, in-memory repos. Frontend in `web/`.

## Run (offline demo)

```bash
npm install
cp .env.example .env   # AI_PROVIDER=mock works with no keys
npm run dev            # :3000
npm test               # vitest, mocked provider only
```

## Flow

Learner submits ONE complete solution → backend persists it → `EvaluationOrchestrator`
selects skills from the problem profile → builds scenario tasks (same solution to every
skill) → evaluates linearly (one skill at a time on Ollama) → streams SSE events per
skill, including raw model tokens as they generate → aggregates deterministically →
updates learner skill memory.

`POST /api/attempts` → `PUT /api/attempts/:id/submission` (autosave drafts) →
`POST /api/attempts/:id/submit {solution}` (single entry point, 202 fast) →
`GET /api/attempts/:id/evaluation-events` (SSE: started → skill.started/token/completed → completed) →
`GET /api/learners/:id/skills`.

## API

| Method | Route |
|---|---|
| GET | /api/problems, /api/problems/:id |
| GET | /api/skills (id/name/description catalog; prompts stay backend-only) |
| POST | /api/attempts `{learnerId, problemId}` |
| GET | /api/attempts/:id |
| PUT | /api/attempts/:id/submission (autosave drafts) |
| POST | /api/attempts/:id/submit `{solution}` (202, async) |
| GET | /api/attempts/:id/evaluation |
| GET | /api/attempts/:id/evaluation-events (SSE stream) |
| POST | /api/attempts/:id/retry-evaluation |
| GET | /api/learners/:id/attempts |
| GET | /api/learners/:id/skills, /api/learners/:id/skills/:skillId |

## Config

`AI_PROVIDER=mock|ollama|claude`. See `.env.example`. Claude key stays server-side.
# a1
