import type { HarnessProvider } from './base.js';
import type { RawResult } from '../types.js';
import { createRawResult, createMetrics } from '../types.js';
import { runCli } from '../cli.js';

export class OpenCodeProvider implements HarnessProvider {
  private readonly bin: string;

  constructor(binPath = 'opencode') {
    this.bin = binPath;
  }

  async execute(prompt: string, options: Record<string, unknown>): Promise<RawResult> {
    const cmd = [this.bin, '--non-interactive'];

    if (options.model) {
      cmd.push('--model', String(options.model));
    }
    cmd.push(prompt);

    const startApi = Date.now();
    try {
      const { stdout, stderr, exitCode } = await runCli(cmd, {
        env: options.env as Record<string, string> | undefined,
        cwd: options.cwd as string | undefined,
      });

      const resultText = stdout.trim() || undefined;
      const isError = exitCode !== 0 && !resultText;

      return createRawResult({
        result: resultText,
        messages: [],
        metrics: createMetrics({
          durationApiMs: Date.now() - startApi,
          numTurns: resultText ? 1 : 0,
          sessionId: '',
        }),
        isError,
        errorMessage: isError ? stderr.trim() : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) {
        return createRawResult({
          isError: true,
          errorMessage: `OpenCode binary not found at '${this.bin}'. Install: https://github.com/opencode-ai/opencode`,
          metrics: createMetrics({ durationApiMs: Date.now() - startApi }),
        });
      }
      return createRawResult({
        isError: true,
        errorMessage: msg,
        metrics: createMetrics({ durationApiMs: Date.now() - startApi }),
      });
    }
  }
}
