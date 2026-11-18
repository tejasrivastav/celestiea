import { DomainError, type DomainErrorCode, type FieldError } from './errors';

// RFC 9457. The read API (inside GraphQL error extensions) and the write API (as the
// response body) both build problems here, so clients see one shape.
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: FieldError[];
}

const problemByCode: Record<DomainErrorCode, { status: number; title: string; slug: string }> = {
  validation_failed: { status: 400, title: 'Validation failed', slug: 'validation-failed' },
  not_found: { status: 404, title: 'Not found', slug: 'not-found' },
  conflict: { status: 409, title: 'Conflict', slug: 'conflict' },
  version_mismatch: { status: 412, title: 'Version mismatch', slug: 'version-mismatch' },
};

export function toProblem(error: unknown): Problem {
  if (!(error instanceof DomainError)) {
    return {
      type: '/problems/internal',
      title: 'Internal error',
      status: 500,
      detail: 'Something went wrong on our side.',
    };
  }
  const { status, title, slug } = problemByCode[error.code];
  const problem: Problem = { type: `/problems/${slug}`, title, status, detail: error.message };
  if (error.fieldErrors.length > 0) {
    problem.errors = error.fieldErrors;
  }
  return problem;
}
