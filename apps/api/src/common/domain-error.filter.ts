import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@xenia/shared';

/** Maps typed domain errors (e.g. BookingConflictError → 409) to HTTP responses. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(err: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(err.status).json({ statusCode: err.status, code: err.code, message: err.message });
  }
}
