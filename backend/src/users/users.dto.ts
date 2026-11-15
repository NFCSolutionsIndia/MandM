import { z } from 'zod';

import { normalizeUsername, usernameProblem } from './username.js';

/** `GET /users/username-available?u=` — any text; a malformed name is an answer, not an error. */
export const usernameAvailableQuerySchema = z.object({
  u: z.string().min(1, 'is required').max(64),
});
export type UsernameAvailableQueryDto = z.infer<typeof usernameAvailableQuerySchema>;

/** `PATCH /users/me/username` — answered with 422 when malformed. */
export const changeUsernameSchema = z.object({
  username: z
    .string()
    .max(64)
    .transform(normalizeUsername)
    .superRefine((u, ctx) => {
      const problem = usernameProblem(u);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
});
export type ChangeUsernameDto = z.infer<typeof changeUsernameSchema>;
