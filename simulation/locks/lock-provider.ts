/**
 * The `LockProvider` interface every lock integration implements — the simulator
 * here and the real Seam adapter both. Swapping providers is a config change
 * (`LOCK_PROVIDER=simulator|seam`), never a rewrite.
 */
export interface AccessWindow {
  credentialId: string;
  validFrom: Date;
  validTo: Date;
}

export interface LockProvider {
  issueCode(lockId: string, window: AccessWindow): Promise<{ code: string }>;
  revoke(lockId: string, credentialId: string): Promise<void>;
  getState(lockId: string): Promise<{ online: boolean; battery: number }>;
}

/**
 * In-memory simulator with controllable failures so the access lifecycle and the
 * reconciliation job can be exercised end to end without hardware.
 */
export class SimulatedLockProvider implements LockProvider {
  private failures = new Set<string>();
  private state = new Map<string, { online: boolean; battery: number }>();

  injectFailure(lockId: string) {
    this.failures.add(lockId);
  }

  async issueCode(lockId: string, window: AccessWindow): Promise<{ code: string }> {
    if (this.failures.has(lockId)) throw new Error(`lock ${lockId} offline`);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    return { code };
  }

  async revoke(): Promise<void> {
    // no-op in the simulator
  }

  async getState(lockId: string): Promise<{ online: boolean; battery: number }> {
    return this.state.get(lockId) ?? { online: !this.failures.has(lockId), battery: 90 };
  }
}
