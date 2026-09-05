import { ApiError } from '@xenia/sdk';

/** A human-readable message for a caught error, including zod field issues. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.issues?.length) {
      return err.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(' · ');
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
