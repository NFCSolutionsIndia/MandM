import { z } from 'zod';

export const MOMENT_TYPES = ['capsule', 'birthday', 'anniversary', 'event'] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

/**
 * `GET /moments/upcoming?limit=&types=`. `limit` defaults to 5, at most 20.
 *
 * `types` is a comma list (`types=capsule` for Home's "Sending soon"). Absent
 * means every type, which is what the endpoint returned before it existed.
 */
export const upcomingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
  types: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] : []))
    .pipe(z.array(z.enum(MOMENT_TYPES))),
});
export type UpcomingQueryDto = z.infer<typeof upcomingQuerySchema>;

/** Where an item came from, so the app knows what `id` points at. */
export type MomentSource = 'capsule' | 'person' | 'event';

export interface UpcomingMoment {
  type: MomentType;
  /** A capsule id, a member id (source `person`), or an event id. */
  id: string;
  source: MomentSource;
  /** Uses the person's nickname when they have one: "Mom's birthday". */
  title: string;
  /** `YYYY-MM-DD`, in the user's timezone. */
  date: string;
  daysLeft: number;
  /**
   * Birthdays: the age reached on `date` ("Dad turns 60"). Anniversaries: the
   * years marked. Null for capsules and for events that do not repeat yearly.
   */
  turns: number | null;
  person: {
    id: string;
    name: string;
    nickname: string | null;
    /** The nickname, or the name: what the screens put first. */
    displayName: string;
    location: string | null;
    avatarUrl: string | null;
    deceased: boolean;
  } | null;
}

export interface UpcomingResponse {
  items: UpcomingMoment[];
  /** Matching moments from today to today + 6, whatever `limit` is. */
  counts: { next7Days: number };
}
