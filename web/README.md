# LLD Practice — Frontend

React + TypeScript + Vite. Backend untouched; all data from `/api` (proxied to `localhost:3000` in dev).

```bash
# terminal 1 — backend (mock provider, offline)
cd .. && AI_PROVIDER=mock npm run dev

# terminal 2 — frontend
npm install
npm run dev   # http://localhost:5173, learner = demo-user
```

Flow: Problems → Details → Start Attempt → Practice (autosaves to backend + localStorage) → Submit → polling status (Submitted → Evaluating → Completed/Failed + Retry) → skill-grouped feedback with evidence → Skills dashboard → History → Try Again.
