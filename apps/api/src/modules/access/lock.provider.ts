import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

/**
 * The LockProvider port. The simulator below and a real Seam adapter implement
 * the same interface — selected via LOCK_PROVIDER (see .env.example). Swapping
 * in real hardware is a config change, not a rewrite.
 */
export interface LockProvider {
  issueCode(lockId: string | null, validFrom: Date, validTo: Date): Promise<{ code: string; ref: string }>;
  revoke(lockId: string | null, ref: string): Promise<void>;
}

@Injectable()
export class SimulatedLockProvider implements LockProvider {
  private failures = new Set<string>();

  /** Test hook: make a lock behave as offline. */
  injectFailure(lockId: string) {
    this.failures.add(lockId);
  }

  async issueCode(
    lockId: string | null,
    _validFrom: Date,
    _validTo: Date,
  ): Promise<{ code: string; ref: string }> {
    if (lockId && this.failures.has(lockId)) throw new Error(`lock ${lockId} offline`);
    const code = String(randomInt(100000, 1000000));
    return { code, ref: `sim:${code}` };
  }

  async revoke(_lockId: string | null, _ref: string): Promise<void> {
    // no-op in the simulator
  }
}
