import type { HarnessProvider } from './base.js';
import type { HarnessConfig } from '../types.js';
import { ClaudeCodeProvider } from './claude.js';
import { CodexProvider } from './codex.js';
import { GeminiProvider } from './gemini.js';
import { OpenCodeProvider } from './opencode.js';

export const SUPPORTED_PROVIDERS = new Set(['claude-code', 'codex', 'gemini', 'opencode']);

export function buildProvider(config: HarnessConfig): HarnessProvider {
  if (!SUPPORTED_PROVIDERS.has(config.provider)) {
    throw new Error(
      `Unknown harness provider: "${config.provider}". Supported: ${[...SUPPORTED_PROVIDERS].sort().join(', ')}`
    );
  }
  if (config.provider === 'claude-code') {
    return new ClaudeCodeProvider();
  }
  if (config.provider === 'codex') {
    return new CodexProvider(config.codexBin ?? 'codex');
  }
  if (config.provider === 'gemini') {
    return new GeminiProvider(config.geminiBin ?? 'gemini');
  }
  if (config.provider === 'opencode') {
    return new OpenCodeProvider(config.opencodeBin ?? 'opencode');
  }
  throw new Error(`Provider "${config.provider}" is not yet implemented.`);
}
