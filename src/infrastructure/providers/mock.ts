import { LLMProvider, LLMRequest, LLMResponse } from '../../application/evaluator/types.js';
import { MAX_SCORE } from '../../application/evaluator/runner.js';

const SKILL_KEYWORDS: Record<string, string[]> = {
  requirement_understanding: ['enum', 'entity', 'attribute', 'assumption', 'clarif', 'requirement', 'ambigu'],
  responsibility_design: ['class', 'responsib', 'single responsibility', 'owns', 'service', 'separate'],
  coupling_cohesion: ['interface', 'strategy', 'decoupl', 'dependenc', 'coupl', 'cohes', 'contract'],
  abstraction_encapsulation: ['encapsul', 'private', 'hidden', 'expose', 'interface', 'abstrac', 'api'],
  extensibility: ['extens', 'open', 'closed', 'new type', 'plugin', 'subclass', 'polymorph'],
  scalability: ['lock', 'concurrent', 'index', 'scal', 'bottleneck', 'partition', 'shard', 'queue', 'thread'],
  failure_handling: ['fail', 'retry', 'rollback', 'compensat', 'transaction', 'recovery', 'exception', 'consisten'],
  edge_cases_testability: ['test', 'mock', 'edge case', 'boundary', 'empty', 'null', 'concurrent', 'di', 'inject'],
};

const FILLER_TAGS = {
  weakness: ['generalization', 'assumed_behavior'],
  strength: ['attempted_analysis', 'structured_approach'],
};
const CLAUDE_MODEL_FALLBACK = 'claude-3-5-sonnet-20241022';

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const content = request.userMessage;
    const skillName = extractSkillName(request.systemPrompt);
    const keywords = SKILL_KEYWORDS[skillName] ?? [];

    const hits = keywords.filter((k) => content.toLowerCase().includes(k));
    const sectionsScore = analyzeSections(content);
    const basePoints = hits.length * 0.5;
    const qualityPenalty = qualityPenaltyFor(content);

    let score = Math.round(sectionsScore * 6 + Math.min(2.5, basePoints) - qualityPenalty);
    score = Math.max(1, Math.min(MAX_SCORE - 1, score));

    const evidence = hits.slice(0, 3).map((k) => ({
      candidateExcerpt: `Submission mentions "${k}"`,
      observation: `Keyword "${k}" relevant to ${skillName} was found; treated as indicative, not proof.`,
    }));

    if (evidence.length === 0) {
      evidence.push({
        candidateExcerpt: 'Submission text as a whole',
        observation:
          'No skill-specific indicators found; scored on general completeness. Confidence adjusted downward.',
      });
    }

    const confidence = 0.5 + Math.min(0.4, hits.length / 10);

    return {
      content: JSON.stringify({
        score,
        confidence,
        evidence,
        strengths: hits.length > 0
          ? [`Shows awareness of ${skillName} concerns`]
          : ['Submission is reasonably structured'],
        concerns: hits.length > 0
          ? ['Scored heuristically; needs real model review']
          : ['No explicit skill-specific reasoning found; review manually'],
        suggestions: [
          'Run with AI_PROVIDER=claude or ollama for a real skill evaluation',
        ],
        weaknessTags: hits.length > 0
          ? FILLER_TAGS.weakness
          : ['missing_skill_indicators'],
        strengthTags: FILLER_TAGS.strength,
      }),
    };
  }
}

function extractSkillName(systemPrompt: string): string {
  const match = systemPrompt.match(/^Name: (.+)$/m);
  return match ? match[1].toLowerCase() : '';
}

function analyzeSections(content: string): number {
  const sections = content.toLowerCase().split('### ').slice(1);
  if (sections.length === 0) return 0;

  const emptied = sections
    .map((s) => s.split('\n').slice(1).join('\n').trim())
    .filter((s) => s.length > 0);

  const filled = emptied.length;
  const avgLen = emptied.reduce((a, b) => a + b.length, 0) / Math.max(1, emptied.length);

  const fillerBonus = emptied.filter(
    (s) => s.length > 60 && !/^(n\/a|tbd|none|no)/i.test(s),
  ).length;

  return Math.min(1, (filled / sections.length) * 0.7 + (fillerBonus / sections.length) * 0.3);
}

function qualityPenaltyFor(content: string): number {
  const lower = content.toLowerCase();
  let penalty = 0;
  if (/(\bn\/a\b|\btbd\b|\bnone\b|not sure|no idea)/.test(lower)) penalty += 1;
  return Math.min(1.5, penalty);
}