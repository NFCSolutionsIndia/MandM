import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
  UnprocessableEntityException,
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
  /**
   * `status` is 400 unless a contract says otherwise. Some do: the admin
   * endpoints answer a well-formed body with invalid values as 422.
   */
  constructor(
    private readonly schema: ZodType,
    private readonly status: 400 | 422 = 400,
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      // Field and message only. The VALUE is never echoed: these bodies carry
      // email addresses and sign-in codes, and a validation error is a log
      // line as surely as it is a response.
      const Exception =
        this.status === 422 ? UnprocessableEntityException : BadRequestException;
      throw new Exception({
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
