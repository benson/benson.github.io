import { EXIT } from './constants.mjs';

// A controlled, user-facing failure. The dispatcher prints it (respecting
// --json) and exits with `code`. Anything else that throws is an unexpected
// bug and exits 1 with a stack trace under --verbose.
export class CliError extends Error {
  constructor(message, code = EXIT.ERROR, extra = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.extra = extra;
  }
}

export const usageError = (message) => new CliError(message, EXIT.USAGE);
export const authError = (message = 'not logged in — run `bp login`') => new CliError(message, EXIT.AUTH);
export const rateLimitError = (message = 'rate limited by the server — try again shortly') => new CliError(message, EXIT.RATE_LIMIT);
