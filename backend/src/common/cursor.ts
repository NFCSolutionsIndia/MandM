import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset cursors: the sort key of the last row, base64url-encoded.
 *
 * Keyset rather than OFFSET, so a page is as fast at row 10 000 as at row 1,
 * and a row added mid-scroll neither repeats nor skips one. Opaque so clients
 * pass it back untouched instead of building their own.
 */
export function encodeCursor(key: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

/** The key inside a cursor, checked against `shape` ('s' string, 'n' number). 400 if it is not one of ours. */
export function decodeCursor(cursor: string, shape: readonly ('s' | 'n')[]): (string | number)[] {
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(key) &&
      key.length === shape.length &&
      key.every((v, i) => (shape[i] === 's' ? typeof v === 'string' : typeof v === 'number'))
    ) {
      return key as (string | number)[];
    }
  } catch {
    // fall through
  }
  throw new BadRequestException({
    message: 'Validation failed',
    errors: [{ field: 'cursor', message: 'is not a cursor this endpoint issued' }],
  });
}
