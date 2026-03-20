import type { HarnessProvider } from './base.js';
import type { RawResult } from '../types.js';
import { createRawResult, createMetrics } from '../types.js';
import { runCli, estimateCliCost } from '../cli.js';

export class CursorProvider implements HarnessProvider {
  private readonly bin: string;
  private readonly serverUrl?: string;

  constructor(binPath = 'cursor', serverUrl?: string) {
    this.bin = binPath;
    this.serverUrl = serverUrl;
  }

  async execute(prompt: string, options: Record<string, unknown>): Promise<RawResult> {
    const cmd = [this.bin, 'run'];

    if (this.serverUrl) {
      cmd.push('--server', this.serverUrl);
    }

    if (options.cwd) {
      cmd.push('--dir', String(options.cwd));
    }
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

      const totalCostUsd = estimateCliCost(
        typeof options.model === 'string' ? options.model : undefined,
        prompt,
        resultText
      );

      return createRawResult({
        result: resultText,
        messages: [],
        metrics: createMetrics({
          durationApiMs: Date.now() - startApi,
          numTurns: resultText ? 1 : 0,
          sessionId: '',
          totalCostUsd,
        }),
        isError,
        errorMessage: isError ? stderr.trim() : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) {
        return createRawResult({
          isError: true,
          errorMessage: `Cursor binary not found at '${this.bin}'. Install: https://cursor.sh`,
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
