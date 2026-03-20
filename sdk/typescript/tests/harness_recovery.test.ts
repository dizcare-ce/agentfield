import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { RawResult } from '../src/harness/types.js';
import type { HarnessProvider } from '../src/harness/providers/base.js';
import { createMetrics, createRawResult } from '../src/harness/types.js';
import { getOutputPath } from '../src/harness/schema.js';
import { HarnessRunner } from '../src/harness/runner.js';
import * as factory from '../src/harness/providers/factory.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentfield-recovery-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

class RecoveryMockProvider implements HarnessProvider {
  public callCount = 0;
  public prompts: string[] = [];
  public options: Record<string, unknown>[] = [];

  public constructor(private readonly actions: ((cwd: string) => RawResult)[]) {}

  public async execute(prompt: string, options: Record<string, unknown>): Promise<RawResult> {
    this.callCount += 1;
    this.prompts.push(prompt);
    this.options.push(options);
    
    const cwd = typeof options.cwd === 'string' ? options.cwd : '.';
    
    if (this.callCount <= this.actions.length) {
      return this.actions[this.callCount - 1](cwd);
    }
    return createRawResult({ result: 'default result' });
  }
}

describe('harness schema recovery (4-layer)', () => {
  const schema = z.object({ name: z.string(), count: z.number() });

  it('Layer 1: direct parse succeeds immediately', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), JSON.stringify({ name: 'ok', count: 1 }), 'utf8');
        return createRawResult({
          result: 'done',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: 's1' }),
        });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt 1', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(false);
    expect(result.parsed).toEqual({ name: 'ok', count: 1 });
    expect(provider.callCount).toBe(1);
    expect(result.numTurns).toBe(1);
    expect(result.costUsd).toBe(0.1);
  });

  it('Layer 2: cosmetic repair succeeds without extra calls', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), '```json\n{"name": "repaired", "count": 2,}\n```', 'utf8');
        return createRawResult({
          result: 'done',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: 's2' }),
        });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt 2', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(false);
    expect(result.parsed).toEqual({ name: 'repaired', count: 2 });
    expect(provider.callCount).toBe(1);
  });

  it('Layer 3: follow-up prompt recovers missing fields', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), JSON.stringify({ name: 'bad' }), 'utf8');
        return createRawResult({
          result: 'failed attempt',
          metrics: createMetrics({ numTurns: 2, totalCostUsd: 0.2, sessionId: 's3' }),
        });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), JSON.stringify({ name: 'fixed', count: 3 }), 'utf8');
        return createRawResult({
          result: 'fixed attempt',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: 's3' }),
        });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt 3', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(false);
    expect(result.parsed).toEqual({ name: 'fixed', count: 3 });
    expect(provider.callCount).toBe(2);
    expect(provider.prompts[1]).toContain('failed validation');
    expect(provider.options[1].sessionId).toBe('s3');
    
    expect(result.numTurns).toBe(3);
    expect(result.costUsd).toBe(0.30000000000000004);
    expect(result.sessionId).toBe('s3');
  });

  it('Layer 4: full retry recovers when follow-up also fails', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'not json', 'utf8');
        return createRawResult({
          result: 'attempt 1',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: 's4' }),
        });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'still bad', 'utf8');
        return createRawResult({
          result: 'attempt 2',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: 's4' }),
        });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), JSON.stringify({ name: 'retry', count: 4 }), 'utf8');
        return createRawResult({
          result: 'attempt 3',
          metrics: createMetrics({ numTurns: 3, totalCostUsd: 0.3, sessionId: 's5' }),
        });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt 4', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(false);
    expect(result.parsed).toEqual({ name: 'retry', count: 4 });
    expect(provider.callCount).toBe(3);
    
    expect(provider.prompts[1]).toContain('failed validation');
    expect(provider.prompts[2]).toContain('prompt 4');
    expect(provider.prompts[2]).toContain('OUTPUT REQUIREMENTS');
    
    expect(result.numTurns).toBe(5);
    expect(result.costUsd).toBe(0.5);
    expect(result.sessionId).toBe('s5');
  });

  it('Skips Layer 3 if no sessionId is available', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'bad', 'utf8');
        return createRawResult({
          result: 'no session here',
          metrics: createMetrics({ numTurns: 1, totalCostUsd: 0.1, sessionId: '' }),
        });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), JSON.stringify({ name: 'recovered', count: 10 }), 'utf8');
        return createRawResult({
          result: 'retry success',
          metrics: createMetrics({ numTurns: 2, totalCostUsd: 0.2, sessionId: 's-retry' }),
        });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(false);
    expect(result.parsed).toEqual({ name: 'recovered', count: 10 });
    expect(provider.callCount).toBe(2); // Initial + Retry (Layer 4)
    expect(provider.prompts[1]).toContain('prompt'); // Should be the original prompt (Layer 4)
    expect(result.numTurns).toBe(3);
  });

  it('Fails completely if all 4 layers fail', async () => {
    const cwd = makeTempDir();
    const provider = new RecoveryMockProvider([
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'bad 1', 'utf8');
        return createRawResult({ metrics: createMetrics({ sessionId: 's6' }) });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'bad 2', 'utf8');
        return createRawResult({ metrics: createMetrics({ sessionId: 's6' }) });
      },
      (dir) => {
        fs.writeFileSync(getOutputPath(dir), 'bad 3', 'utf8');
        return createRawResult({ metrics: createMetrics({ sessionId: 's7' }) });
      }
    ]);
    vi.spyOn(factory, 'buildProvider').mockResolvedValue(provider);

    const runner = new HarnessRunner();
    const result = await runner.run('prompt 5', { provider: 'codex', schema, cwd });

    expect(result.isError).toBe(true);
    expect(result.parsed).toBeUndefined();
    expect(result.errorMessage).toContain('Schema validation failed after parse, cosmetic repair, follow-up prompt, and full retry');
    expect(provider.callCount).toBe(3);
  });
});
