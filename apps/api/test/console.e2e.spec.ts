import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './helpers';

describe('Dev console (e2e)', () => {
  let app: INestApplication;
  let http: unknown;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
  });
  afterAll(async () => app.close());

  it('serves the console in non-production without auth', async () => {
    const res = await request(http as never).get('/console');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Xenia — Dev Console');
    expect(res.text).toContain('Run everything');
  });

  it('is hidden in production unless explicitly enabled', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ENABLE_DEV_CONSOLE;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ENABLE_DEV_CONSOLE;
      const hidden = await request(http as never).get('/console');
      expect(hidden.status).toBe(404);

      process.env.ENABLE_DEV_CONSOLE = 'true';
      const shown = await request(http as never).get('/console');
      expect(shown.status).toBe(200);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevFlag === undefined) delete process.env.ENABLE_DEV_CONSOLE;
      else process.env.ENABLE_DEV_CONSOLE = prevFlag;
    }
  });
});
