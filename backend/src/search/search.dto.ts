import { z } from 'zod';

/**
 * The Search screen's chips: All · People · Memories · Dates.
 *
 * There is no "chats" section: the design has no Chats chip, and the product
 * has no chat feature yet (decision D-7). Adding one later is a new value
 * here, not a change to the response shape.
 */
export const SEARCH_TYPES = ['people', 'memories', 'dates'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * `GET /search?q=dad&types=people,memories,dates&limit=5&cursor=`
 *
 * "All" sends every type with a small limit. "See all" on one chip sends a
 * single type and pages it with that section's `nextCursor`. A cursor
 * belongs to one section, so it is refused alongside more than one type.
 */
export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(2, 'must be at least 2 characters').max(100),
    types: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) =>
        v ? [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] : [...SEARCH_TYPES],
      )
      .pipe(z.array(z.enum(SEARCH_TYPES)).min(1)),
    limit: z.coerce.number().int().min(1).max(50).default(5),
    cursor: z.string().max(500).optional(),
  })
  .refine((v) => v.cursor === undefined || v.types.length === 1, {
    path: ['cursor'],
    message: 'a cursor pages one section; send exactly one type with it',
  });
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
