/**
 * The HTTP calls the app makes, in one place.
 *
 * Everything a resident does is either reading public data or marking an event,
 * so this is a small surface: a GET that parses, and a write that carries a
 * device token. No SDK, no client generator — the API has a dozen endpoints and a
 * generated client would be more code than the thing it calls.
 *
 * What it does take seriously is failing well. A neighbour opens this in a street
 * full of people during a fiesta, on a phone with one bar of signal: a request
 * that hangs forever is worse than one that gives up, so everything has a timeout,
 * and a failure carries enough to tell "there is no coverage" from "that event is
 * gone".
 */
export type ApiFailure =
  /** No answer at all: no coverage, aeroplane mode, the request timed out. */
  | { kind: 'offline' }
  /** The server answered, and said no. */
  | { kind: 'status'; status: number; code: string | null }
  /** The server answered with something this version cannot read. */
  | { kind: 'unreadable' };

export class ApiError extends Error {
  readonly failure: ApiFailure;

  // The original error is kept as the cause. Without it, "no hay conexión" is
  // also what a bug in this file looks like, and that is an afternoon of
  // guessing.
  constructor(failure: ApiFailure, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.failure = failure;
  }
}

export interface ApiClientOptions {
  /** Base URL of the API, with or without a trailing slash. */
  baseUrl: string;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
  /** The device token, when there is one. Read on every call, never captured. */
  token?: () => string | null;
  /** For tests, and for anything that needs to intercept. */
  fetch?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string, parse: (value: unknown) => T): Promise<T>;
  /** Returns null when the server answered 404, which is an answer and not a failure. */
  getOrNull<T>(path: string, parse: (value: unknown) => T): Promise<T | null>;
  send(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown>;
}

const DEFAULT_TIMEOUT_MS = 8000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const call = options.fetch ?? globalThis.fetch;

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const token = options.token?.() ?? null;

    const headers: Record<string, string> = {};

    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token !== null) headers['authorization'] = `Bearer ${token}`;

    try {
      return await call(`${base}${path}`, {
        method,
        headers,
        signal: AbortSignal.timeout(timeout),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (thrown) {
      // A timeout and a dead network are the same thing to a neighbour: nothing
      // came back, try again later.
      throw new ApiError({ kind: 'offline' }, 'No hay conexión.', thrown);
    }
  }

  /** The `error` field of our own error bodies, when there is one. */
  async function codeOf(response: Response): Promise<string | null> {
    try {
      const payload: unknown = await response.json();

      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        const code = (payload as { error: unknown }).error;

        return typeof code === 'string' ? code : null;
      }
    } catch {
      // An error body that is not JSON is not worth a different message.
    }

    return null;
  }

  async function parsed<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new ApiError({ kind: 'unreadable' }, 'La respuesta no se entiende.');
    }

    try {
      return parse(payload);
    } catch {
      // The schema said no, which means this app is older than the API. Saying
      // "unreadable" rather than crashing keeps the rest of the screen alive.
      throw new ApiError({ kind: 'unreadable' }, 'La respuesta no se entiende.');
    }
  }

  return {
    async get(path, parse) {
      const response = await request('GET', path);

      if (!response.ok) {
        throw new ApiError(
          { kind: 'status', status: response.status, code: await codeOf(response) },
          `La petición ha fallado (${response.status}).`,
        );
      }

      return parsed(response, parse);
    },

    async getOrNull(path, parse) {
      const response = await request('GET', path);

      if (response.status === 404) return null;

      if (!response.ok) {
        throw new ApiError(
          { kind: 'status', status: response.status, code: await codeOf(response) },
          `La petición ha fallado (${response.status}).`,
        );
      }

      return parsed(response, parse);
    },

    async send(method, path, body) {
      const response = await request(method, path, body);

      if (!response.ok) {
        throw new ApiError(
          { kind: 'status', status: response.status, code: await codeOf(response) },
          `La petición ha fallado (${response.status}).`,
        );
      }

      if (response.status === 204) return null;

      return response.json().catch(() => null);
    },
  };
}
