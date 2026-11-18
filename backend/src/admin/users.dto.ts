import { z } from 'zod';

/** `GET /admin/v1/users?q=&cursor=&limit=` — q matches email, phone or username. */
export const searchUsersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type SearchUsersDto = z.infer<typeof searchUsersSchema>;

/** `GET /admin/v1/users/:id/sessions?cursor=&limit=` — newest first. */
export const listSessionsSchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListSessionsDto = z.infer<typeof listSessionsSchema>;
