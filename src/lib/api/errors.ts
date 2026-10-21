export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
