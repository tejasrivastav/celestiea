import { ProblemError, type Problem } from './problem';

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { problem?: Problem } }[];
}

// Queries go over GET so CloudFront and the browser can cache them.
export async function graphql<T>(query: string, variables: object = {}): Promise<T> {
  const params = new URLSearchParams({ query, variables: JSON.stringify(variables) });
  const response = await fetch(`/v1/graphql?${params.toString()}`);
  const body = (await response.json()) as GraphqlResponse<T>;
  const error = body.errors?.[0];
  if (error !== undefined) {
    throw new ProblemError(
      error.extensions?.problem ?? {
        type: '/problems/internal',
        title: 'Error',
        status: response.status,
        detail: error.message,
      },
    );
  }
  if (body.data === undefined) {
    throw new Error(`GraphQL response without data (HTTP ${response.status})`);
  }
  return body.data;
}
