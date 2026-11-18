// RFC 9457 problem details, as returned by the write API and inside GraphQL errors.
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: { path: string; message: string }[];
}

export class ProblemError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail);
  }
}
