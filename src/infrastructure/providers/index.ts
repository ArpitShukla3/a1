import { Config } from '../config.js';
import { LLMProvider } from '../../application/evaluator/types.js';
import { MockProvider } from './mock.js';
import { ClaudeProvider } from './claude.js';
import { OllamaProvider } from './ollama.js';

export function createProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config.anthropicApiKey, config.claudeModel);
    case 'ollama':
      return new OllamaProvider(config.ollamaBaseUrl, config.ollamaModel);
    case 'mock':
    default:
      return new MockProvider();
  }
}