import type { EvaluationTask, Evidence, LLMProvider, SkillEvaluationResult } from '../domain/types.js';

function submissionText(s: EvaluationTask['submission']): string {
  if (s.kind === 'solution') return (s as { solution: string }).solution;
  if (s.kind !== 'text') return JSON.stringify(s);
  const t = s as Record<string, string>;
  return ['requirementsUnderstanding', 'assumptions', 'classes', 'responsibilities', 'relationships', 'mainFlow', 'designDecisions', 'edgeCases']
    .map(k => `## ${k}\n${t[k] ?? ''}`).join('\n');
}

export function buildSkillPrompt(task: EvaluationTask): string {
  const { skill, scenario, problem, submission } = task;
  return [
    'You evaluate ONE LLD skill. Multiple valid designs exist — never grade by matching a reference solution.',
    `Problem: ${problem.title}. Skill: ${skill.name} (v${skill.version}). Scenario: ${scenario.question}`,
    `Criteria: ${skill.criteria.map(c => c.description).join('; ')}`,
    `Grounding (reference patterns only, not answers): ${skill.groundingExamples.map(g => `[${g.label}] ${g.pattern} — ${g.explanation}`).join(' | ')}`,
    `Candidate submission:\n${submissionText(submission)}`,
    'Return ONLY JSON: {"score":0-5,"confidence":0-1,"evidence":[{"candidateExcerpt":"...","observation":"..."}],"strengths":[],"concerns":[],"suggestions":[],"weaknessTags":[],"strengthTags":[]}.',
    'Keep it tight: at most 3 evidence items and 3 bullets per list, each under 25 words.',
    'Every concern MUST quote actual candidate text in evidence. If evidence is insufficient, put "insufficient evidence" in concerns and score <= 2.',
  ].join('\n');
}

// Deterministic heuristic mock: scores from content richness. Offline demo safe.
export class MockProvider implements LLMProvider {
  name = 'mock';
  async generate(prompt: string, onToken?: (token: string) => void): Promise<string> {
    const m = prompt.match(/Candidate submission:\n([\s\S]*)$/);
    const text = (m?.[1] ?? '').toLowerCase();
    const len = text.length;
    const keywords = ['interface', 'strategy', 'fail', 'retry', 'scal', 'extens', 'assum', 'edge', 'trade', 'solid', 'encapsul', 'cohes'];
    const hits = keywords.filter(k => text.includes(k)).length;
    const excerptCount = Math.min(3, Math.max(1, Math.floor(len / 400)));
    let score = len < 200 ? 1 : len < 800 ? 2 : len < 2000 ? 3 : 4;
    if (hits >= 5) score = Math.min(5, score + 1);
    const result = {
      score, confidence: len < 200 ? 0.4 : 0.75,
      evidence: len < 200
        ? []
        : Array.from({ length: excerptCount }, (_, i) => ({
            candidateExcerpt: text.slice(i * 120, i * 120 + 120).replace(/\n/g, ' ').slice(0, 120) || 'submission text',
            observation: `Observed design statement relevant to skill (${hits} signal keywords found).`,
          })),
      strengths: len < 200 ? [] : ['Submission addresses the skill with concrete design statements.'],
      concerns: len < 200 ? ['insufficient evidence'] : score < 3 ? ['insufficient evidence of trade-off analysis'] : [],
      suggestions: len < 200 ? ['Add classes, responsibilities, and scenario analysis.'] : ['Deepen scenario analysis with failure/growth cases.'],
      weaknessTags: len < 200 ? ['thin-submission'] : score < 3 ? ['shallow-analysis'] : [],
      strengthTags: score >= 4 ? ['grounded-reasoning'] : len >= 800 ? ['adequate-coverage'] : [],
    };
    const out = JSON.stringify(result);
    // Emit in chunks so the mock also exercises the streaming path.
    const half = Math.floor(out.length / 2);
    onToken?.(out.slice(0, half));
    onToken?.(out.slice(half));
    return out;
  }
}

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  constructor(private baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    private model = process.env.OLLAMA_MODEL ?? 'llama3.1') {}
  async generate(prompt: string, onToken?: (token: string) => void): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model, prompt, stream: true, format: 'json',
        // ponytail: cap output so CPU inference can't wander; skill JSON fits in ~400 tokens.
        options: { num_predict: Number(process.env.OLLAMA_NUM_PREDICT ?? 600) },
      }),
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS ?? 20 * 60 * 1000)),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    if (!res.body) throw new Error('Ollama empty response');
    // ponytail: streaming keeps the connection alive so long CPU generations
    // can't trip the HTTP client's headers/body timeouts (stream:false sends
    // zero bytes until generation finishes, minutes later). Tokens also stream
    // straight through to the client: onToken fires per Ollama chunk as it lands.
    let buf = '';
    let out = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += Buffer.from(chunk).toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const delta = (JSON.parse(t) as { response?: string }).response;
        if (delta) { out += delta; onToken?.(delta); }
      }
    }
    return out;
  }
}

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  // ponytail: dynamic import keeps mock/offline installs light; key stays server-side.
  async generate(prompt: string, onToken?: (token: string) => void): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });
    let out = '';
    for await (const ev of msg) {
      const delta = (ev as { type?: string }).type === 'content_block_delta'
        ? ((ev as { delta?: { text?: string } }).delta?.text ?? '') : '';
      if (delta) { out += delta; onToken?.(delta); }
    }
    return out;
  }
  // Batch API later: group prompts with metadata {taskId} as custom_id, poll, correlate. Structure ready.
  batchItems(tasks: EvaluationTask[]): { custom_id: string; prompt: string }[] {
    return tasks.map(t => ({ custom_id: t.taskId, prompt: buildSkillPrompt(t) }));
  }
}

export function providerFromEnv(): LLMProvider {
  const p = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  if (p === 'claude') return new ClaudeProvider();
  if (p === 'ollama') return new OllamaProvider();
  return new MockProvider();
}

// Parses provider JSON into a SkillEvaluationResult; never throws on model garbage.
export function parseSkillJson(raw: string, task: EvaluationTask): SkillEvaluationResult {
  const fallback = (concerns: string[]): SkillEvaluationResult => ({
    skillId: task.skill.id, skillVersion: task.skill.version, skillName: task.skill.name,
    scenarioId: task.scenario.id, scenarioQuestion: task.scenario.question,
    score: 1, maxScore: task.skill.maxScore, confidence: 0.3, evidence: [],
    strengths: [], concerns, suggestions: ['Resubmit with clearer scenario analysis.'],
    weaknessTags: ['unparseable-output'], strengthTags: [],
    grounding: task.skill.groundingExamples,
  });
  try {
    // Extract the first balanced {...} so trailing prose can't break parsing.
    const start = raw.indexOf('{');
    if (start < 0) throw new Error('no json');
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error('truncated json');
    const parsed = JSON.parse(raw.slice(start, end));
    const score = Math.max(0, Math.min(task.skill.maxScore, Number(parsed.score) || 0));
    // ponytail: drop placeholder "evidence" (e.g. "...") so the UI never presents filler as quotes.
    const evidence = (Array.isArray(parsed.evidence) ? parsed.evidence as unknown[] : [])
      .filter((e: unknown): e is Evidence => {
        const excerpt = (e as { candidateExcerpt?: unknown } | null)?.candidateExcerpt;
        return typeof excerpt === 'string' && excerpt.trim().length >= 15;
      })
      .slice(0, 5);
    return {
      skillId: task.skill.id, skillVersion: task.skill.version, skillName: task.skill.name,
      scenarioId: task.scenario.id, scenarioQuestion: task.scenario.question,
      score, maxScore: task.skill.maxScore,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      evidence,
      strengths: parsed.strengths ?? [], concerns: parsed.concerns?.length ? parsed.concerns : ['insufficient evidence'],
      suggestions: parsed.suggestions ?? [], weaknessTags: parsed.weaknessTags ?? [], strengthTags: parsed.strengthTags ?? [],
      grounding: task.skill.groundingExamples,
    };
  } catch {
    // Log raw output so malformed-model-output failures are diagnosable from backend logs.
    console.error(`[eval] unparseable output for ${task.taskId}: ${raw.slice(0, 400)}`);
    return fallback(['insufficient evidence']);
  }
}
