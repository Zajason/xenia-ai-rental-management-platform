import { Controller, Get, Module, NotFoundException, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../auth/decorators.js';

/**
 * The Xenia Dev Console — an internal tool served by the API itself at
 * GET /console. One self-contained HTML page that exercises every module:
 * auth bootstrap, chained scenario runs (bookings, conflicts, turnovers, door
 * codes, concierge, payouts…), an endpoint catalog with a request builder, and
 * a full request log. It authenticates like any real client — no backdoors.
 *
 * Dev-gated: hidden in production unless ENABLE_DEV_CONSOLE=true.
 */
@ApiExcludeController()
@Controller('console')
class ConsoleController {
  private html: string | null = null;

  private enabled(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_CONSOLE === 'true';
  }

  @Public()
  @Get()
  serve(@Res() res: Response) {
    if (!this.enabled()) throw new NotFoundException();
    // Cache only outside dev so console.html edits show up under watch.
    if (!this.html || process.env.NODE_ENV !== 'production') {
      // __dirname works in src (tests/watch) and dist (assets copied by nest-cli).
      this.html = readFileSync(join(__dirname, 'console.html'), 'utf8');
    }
    res.type('html').send(this.html);
  }
}

@Module({ controllers: [ConsoleController] })
export class ConsoleModule {}
