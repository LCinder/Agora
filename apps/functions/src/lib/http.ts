import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// From the entry point that holds only the error class: importing it from the
// package root would pull in the DynamoDB client, and with it the AWS SDK, into
// functions that never touch the table.
import { StoreError } from '@agora/store/errors';

/**
 * The shapes an HTTP API expects, and the one place errors become status codes.
 *
 * Bodies are JSON with a `charset`, because event titles are full of accents and
 * a missing charset shows up as mojibake in exactly the place a municipal
 * officer will screenshot.
 */
export type ApiEvent = APIGatewayProxyEventV2;
export type ApiResult = APIGatewayProxyResultV2;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function json(statusCode: number, body: unknown): ApiResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function ok(body: unknown): ApiResult {
  return json(200, body);
}

export function noContent(): ApiResult {
  return { statusCode: 204, headers: {}, body: '' };
}

export function error(statusCode: number, code: string, message: string): ApiResult {
  return json(statusCode, { error: code, message });
}

export function notFound(message = 'No existe.'): ApiResult {
  return error(404, 'not_found', message);
}

export function badRequest(message: string): ApiResult {
  return error(400, 'bad_request', message);
}

export function notImplemented(what: string): ApiResult {
  return error(501, 'not_implemented', `${what} todavía no está implementado.`);
}

/** Maps what the store refuses onto status codes. */
const STATUS_FOR: Record<StoreError['code'], number> = {
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 400,
};

/**
 * Runs a handler and turns anything it throws into an answer.
 *
 * A store error carries the status; anything else is a bug, and a bug is a 500
 * with the detail in the log and not in the response — a resident does not need
 * a stack trace and an attacker does not get one.
 */
export async function handle(event: ApiEvent, run: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof StoreError) {
      return error(STATUS_FOR[thrown.code], thrown.code, thrown.message);
    }

    console.error(
      JSON.stringify({
        message: 'unhandled_error',
        route: event.routeKey,
        error: thrown instanceof Error ? thrown.message : String(thrown),
        stack: thrown instanceof Error ? thrown.stack : undefined,
      }),
    );

    return error(500, 'internal_error', 'Algo ha fallado por nuestra parte.');
  }
}

/** A path parameter that has to be there. */
export function pathParameter(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];

  if (value === undefined || value === '') {
    throw new StoreError('invalid', `Falta ${name} en la ruta.`);
  }

  return decodeURIComponent(value);
}

export function tableName(): string {
  const name = process.env['TABLE_NAME'];

  if (name === undefined || name === '') {
    throw new Error('TABLE_NAME is not set.');
  }

  return name;
}
