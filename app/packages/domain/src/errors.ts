export type DomainErrorCode = 'not_found' | 'conflict' | 'version_mismatch' | 'validation_failed';

export interface FieldError {
  path: string;
  message: string;
}

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}
