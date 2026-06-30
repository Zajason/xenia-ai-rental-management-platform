/** Typed domain errors shared by the API and workers. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class BookingConflictError extends DomainError {
  constructor(message = 'Requested dates overlap an existing booking') {
    super(message, 'BOOKING_CONFLICT', 409);
  }
}

export class TenantContextMissingError extends DomainError {
  constructor() {
    super('No tenant context set for this request', 'TENANT_CONTEXT_MISSING', 500);
  }
}
