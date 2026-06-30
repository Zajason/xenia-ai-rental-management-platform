import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (the modern OWASP-recommended choice).
 * `@node-rs/argon2` ships prebuilt binaries, so there's no native compile step.
 */
@Injectable()
export class PasswordService {
  // OWASP-ish defaults; tune memoryCost up in production if latency allows.
  private readonly opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

  hash(plain: string): Promise<string> {
    return hash(plain, this.opts);
  }

  verify(hashed: string, plain: string): Promise<boolean> {
    return verify(hashed, plain).catch(() => false);
  }

  // A real argon2 hash, computed once, used to spend comparable time when a
  // login targets a non-existent user — blunts user-enumeration timing attacks.
  private dummy: Promise<string> | null = null;
  async verifyAgainstDummy(plain: string): Promise<boolean> {
    this.dummy ??= this.hash('xenia-dummy-password-not-a-real-secret');
    return this.verify(await this.dummy, plain);
  }
}
