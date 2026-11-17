import { z } from 'zod';

/** `GET /moments/upcoming?limit=` — default 5, at most 20. */
export const upcomingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type UpcomingQueryDto = z.infer<typeof upcomingQuerySchema>;

export const MOMENT_TYPES = ['capsule', 'birthday', 'anniversary', 'event'] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

/** Where an item came from, so the app knows what `id` points at. */
export type MomentSource = 'capsule' | 'person' | 'event';

export interface UpcomingMoment {
  type: MomentType;
  /** A capsule id, a member id (source `person`), or an event id. */
  id: string;
  source: MomentSource;
  title: string;
  /** `YYYY-MM-DD`, in the user's timezone. */
  date: string;
  daysLeft: number;
  person: {
    id: string;
    name: string;
    avatarUrl: string | null;
    deceased: boolean;
  } | null;
}
