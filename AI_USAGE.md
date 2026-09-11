# AI_USAGE

## Where AI is used
Only inside `SkillEvaluator` → `LLMProvider.generate(prompt)`. One prompt per (submission × skill), including the skill's scenario, criteria, and grounding examples. The model returns JSON per skill; `parseSkillJson` coerces and clamps it.

## Where AI is NOT used
Validation, state machine, idempotency, scoring aggregation, feedback assembly, and all learner-profile math (`computeProfile`) are deterministic TypeScript. The LLM never calculates trends.

## Providers
- `mock` (default): heuristic JSON from content length/keywords. Offline, deterministic, used in all tests. Never calls network.
- `ollama`: `POST {OLLAMA_BASE_URL}/api/generate` with `{model: OLLAMA_MODEL, format: 'json', stream: true}`. Skills evaluated linearly one at a time (`OLLAMA_CONCURRENCY=1`) so the first result reaches the client fast; raw tokens are forwarded to the client via SSE (`skill.token` events) so the evaluation visibly streams instead of silent-wait.
- `claude`: Anthropic Messages API server-side (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`). Also streams tokens through `skill.token`. Key never leaves the server. `batchItems()` prepares `{custom_id: taskId}` payloads for future Batch API use.

## Ollama on CPU: lessons baked in
1. **Stream, don't wait** (`stream: true`). With `stream: false` Ollama sends zero bytes until generation finishes — minutes on CPU — tripping the HTTP client's headers timeout (`fetch failed`). Streaming keeps the connection alive, and each token is pushed straight to the client.
2. **Use a small model, one at a time.** `granite4.1:3b` (2.1 GB) instead of `qwen3:8b` (5.2 GB) roughly halves CPU inference per skill. `OLLAMA_CONCURRENCY=1` guarantees linear execution — no CPU thrashing — so `skill.started` → first token → `skill.completed` all arrive in sequence and the first analysis shows up within seconds, not after all 8 finish.
3. **Constrain verbosity in the prompt** ("at most 3 evidence items / 3 bullets, each under 25 words") plus `OLLAMA_NUM_PREDICT` cap. Unbounded, larger models write ~1400-token answers and get cut off mid-JSON (`done_reason: length` → unparseable).
4. **Parse defensively, retry once.** `parseSkillJson` extracts the first balanced `{...}` (trailing prose can't break it), drops placeholder evidence (`"..."`), and never throws — garbage becomes `score 1 + "insufficient evidence"`. `SkillEvaluator` re-samples once on that tag; persistent failures stay honest fallbacks instead of fake feedback.

## Grounding rules (in every prompt)
- Multiple valid designs; never grade by reference matching.
- Every concern must cite candidate text in `evidence`.
- Insufficient evidence → say so, score ≤ 2. Never invent flaws.
