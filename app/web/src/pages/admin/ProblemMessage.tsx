import { ProblemError } from '../../api/problem';

export function ProblemMessage({ error }: { error: unknown }) {
  if (error === null || error === undefined) {
    return null;
  }
  if (!(error instanceof ProblemError)) {
    return (
      <p role="alert" className="status error">
        Something went wrong. Try again.
      </p>
    );
  }
  const { problem } = error;
  return (
    <div role="alert" className="problem">
      <p>
        <strong>{problem.title}.</strong> {problem.detail}
      </p>
      {problem.errors && (
        <ul>
          {problem.errors.map((fieldError) => (
            <li key={`${fieldError.path}-${fieldError.message}`}>
              <code>{fieldError.path}</code>: {fieldError.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
