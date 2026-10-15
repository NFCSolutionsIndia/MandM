import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request body against a Zod schema.
 *
 * Zod rather than class-validator, for one reason that matters here: these
 * same schemas become the OpenAPI document, and that document generates the
 * Swift and Kotlin clients. One source of truth from the request body to the
 * mobile app, so a field cannot be renamed on the server and still compile on
 * the client.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      // Field and message only. The VALUE is never echoed: these bodies carry
      // email addresses and sign-in codes, and a validation error is a log
      // line as surely as it is a response.
      throw new BadRequestException({
        message: 'Validation failed',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }

    return parsed.data;
  }
}
