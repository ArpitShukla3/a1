import 'dotenv/config';

export type AIProvider = 'mock' | 'ollama' | 'claude';

export interface Config {
  provider: AIProvider;
  anthropicApiKey: string;
  claudeModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = (env.AI_PROVIDER ?? 'mock').toLowerCase();
  if (provider !== 'mock' && provider !== 'ollama' && provider !== 'claude') {
    throw new Error(`Invalid AI_PROVIDER "${provider}". Use mock, ollama, or claude.`);
  }
  if (provider === 'claude' && !env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=claude');
  }
  return {
    provider,
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    claudeModel: env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
    ollamaBaseUrl: env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModel: env.OLLAMA_MODEL ?? 'llama3',
    port: Number(env.PORT ?? 3000),
  };
}