import crypto from 'node:crypto';
import {
  EvaluationTask,
  SkillEvaluationResult,
} from '../../domain/models.js';
import { LLMProvider, Evaluator } from './types.js';

export const MAX_SCORE = 10;

export function buildSystemPrompt(task: EvaluationTask): string {
  const skill = task.skill;
  const scenario = task.scenario;
  const examples = task.groundingExamples
    .map(
      (e) =>
        `[${e.isGood ? 'GOOD PATTERN' : 'BAD PATTERN'}] ${e.title}\n${e.description}`,
    )
    .join('\n\n');

  return `You are an expert Low-Level Design (LLD) evaluator. You evaluate design submissions against a specific skill and scenario.

## Skill
Name: ${skill.name}
Description: ${skill.description}
Criteria:
${skill.criteria.map((c) => `- ${c}`).join('\n')}

## Scenario
${scenario.description}
Question: ${scenario.question}

## Grounding Examples (reference patterns, NOT exact answers)
These examples illustrate good and bad patterns. They are references for calibration, NOT gold solutions. Multiple valid designs exist that satisfy the requirements.

${examples}

## Critical Rules
1. Multiple valid designs exist. NEVER grade by matching a reference solution or the grounding examples.
2. Every concern MUST cite actual evidence from the candidate's submission. Quote or reference their words.
3. If evidence is insufficient for any concern, state "insufficient evidence" rather than inventing a flaw.
4. Score objectively based on the skill criteria above.
5. Be balanced: recognize genuine strengths as well as concerns.

## Response Format
Respond with ONLY raw valid JSON (no markdown code fences, no commentary):
{
  "score": <integer 0-${MAX_SCORE}>,
  "confidence": <number 0-1>,
  "evidence": [{ "candidateExcerpt": "...", "observation": "..." }],
  "strengths": ["..."],
  "concerns": ["..."],
  "suggestions": ["..."],
  "weaknessTags": ["...", "..."],
  "strengthTags": ["...", "..."]
}`;
}

export function buildUserMessage(task: EvaluationTask): string {
  const pc = task.problemContext;
  const sc = task.submissionContent;

  return `## Problem Context
Title: ${pc.title}
Description: ${pc.description}

## Requirements
${pc.requirements.map((r) => `- ${r}`).join('\n')}

## Constraints
${pc.constraints.map((c) => `- ${c}`).join('\n')}

## Candidate's Design Submission

### Requirements Understanding
${sc.requirementsUnderstanding}

### Assumptions
${sc.assumptions}

### Classes
${sc.classes}

### Responsibilities
${sc.responsibilities}

### Relationships
${sc.relationships}

### Main Flow
${sc.mainFlow}

### Design Decisions
${sc.designDecisions}

### Edge Cases
${sc.edgeCases}

Evaluate the submission against the skill and scenario described in the system prompt.`;
}

export class LLMEvaluator implements Evaluator {
  constructor(private readonly provider: LLMProvider) {}

  async evaluate(task: EvaluationTask): Promise<SkillEvaluationResult> {
    const response = await this.provider.generate({
      systemPrompt: buildSystemPrompt(task),
      userMessage: buildUserMessage(task),
    });
    return this.parseResponse(task, response.content);
  }

  private parseResponse(
    task: EvaluationTask,
    content: string,
  ): SkillEvaluationResult {
    const parsed = extractJson(content);
    return {
      skillId: task.skill.id,
      skillVersion: task.skill.version,
      scenarioId: task.scenario.id,
      score: clampScore(parsed.score),
      maxScore: MAX_SCORE,
      confidence: clamp01(parsed.confidence),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      strengths: asStringArray(parsed.strengths),
      concerns: asStringArray(parsed.concerns),
      suggestions: asStringArray(parsed.suggestions),
      weaknessTags: asStringArray(parsed.weaknessTags),
      strengthTags: asStringArray(parsed.strengthTags),
    };
  }
}

export class EvaluationRunner {
  constructor(private readonly evaluator: Evaluator) {}

  async runAll(tasks: EvaluationTask[]): Promise<SkillEvaluationResult[]> {
    const settled = await Promise.allSettled(
      tasks.map((t) => this.evaluator.evaluate(t)),
    );
    return settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return failedResult(tasks[i], result.reason);
    });
  }
}

function failedResult(
  task: EvaluationTask,
  reason: unknown,
): SkillEvaluationResult {
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    skillId: task.skill.id,
    skillVersion: task.skill.version,
    scenarioId: task.scenario.id,
    score: 0,
    maxScore: MAX_SCORE,
    confidence: 0,
    evidence: [],
    strengths: [],
    concerns: [`Evaluation failed: ${message}`],
    suggestions: ['Retry the evaluation.'],
    weaknessTags: ['evaluation_error'],
    strengthTags: [],
  };
}

export function deterministicTaskId(
  attemptId: string,
  submissionVersion: number,
): string {
  return crypto
    .createHash('sha256')
    .update(`${attemptId}:${submissionVersion}`)
    .digest('hex')
    .slice(0, 16);
}

export function evaluationJobId(
  attemptId: string,
  submissionVersion: number,
): string {
  return `eval_${attemptId}_${submissionVersion}`;
}

export function extractJson(content: string): Record<string, unknown> {
  let text = content.trim();
  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)```\s*$/);
  if (fence) text = fence[1].trim();
  if (!text) throw new Error('Empty LLM response');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('LLM response was not valid JSON');
  }
}

export function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.round(n)));
}

export function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}