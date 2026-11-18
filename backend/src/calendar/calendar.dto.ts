import { z } from 'zod';

/**
 * What the calendar shows, and what its filter chips select.
 *
 *   birthday     a person's birthday (their record, or a yearly birthday event)
 *   anniversary  a person's anniversary (their record, or an anniversary event)
 *   event        the user's own custom events
 *   holiday      the user's own `festival` events. A built-in holiday
 *                catalogue (St. Patrick's Day, Diwali …) does not exist yet;
 *                see SCREEN_API_MAP.md, pending item P-4.
 *   capsule      capsules the user owns, on the day they open
 */
export const CALENDAR_TYPES = ['birthday', 'anniversary', 'event', 'holiday', 'capsule'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

/** The longest range one request may expand: a year, leap day included. */
export const MAX_RANGE_DAYS = 366;

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date, YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'is not a real date');

/** `types=birthday,capsule`. Absent or empty means every type. */
export const typesParam = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] : []))
  .pipe(z.array(z.enum(CALENDAR_TYPES)));

const dayDiff = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/**
 * `GET /calendar?from=&to=&types=&q=`: the month grid (one month), the list
 * view (today to the end of the year), and the year view.
 */
export const calendarQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    types: typesParam,
    q: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'must not be before from' })
  .refine((v) => dayDiff(v.from, v.to) < MAX_RANGE_DAYS, {
    path: ['to'],
    message: `the range may cover at most ${MAX_RANGE_DAYS} days`,
  });
export type CalendarQueryDto = z.infer<typeof calendarQuerySchema>;

/** `GET /calendar/summary?year=&types=`: the "Jump to" sheet's per-month counts. */
export const summaryQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200),
  types: typesParam,
});
export type SummaryQueryDto = z.infer<typeof summaryQuerySchema>;

export interface CalendarPerson {
  id: string;
  name: string;
  nickname: string | null;
  /** The nickname, or the name: what the screens put first ("Dad"). */
  displayName: string;
  location: string | null;
  avatarUrl: string | null;
  deceased: boolean;
}

export interface CalendarItem {
  type: CalendarType;
  /** What `id` points at: a person (`/members/:id`), an event or a capsule. */
  source: 'person' | 'event' | 'capsule';
  id: string;
  /** "Mom's birthday", the event title, or the capsule title. */
  title: string;
  /** `YYYY-MM-DD`, a calendar day in the user's timezone. */
  date: string;
  /** Days from today. Negative for days already past in the requested range. */
  daysLeft: number;
  /** Birthdays: the age reached on `date`. Anniversaries: years marked. Otherwise null. */
  turns: number | null;
  /** `none`, `yearly` or `monthly` ("⟳ every year"). */
  recurrence: 'none' | 'yearly' | 'monthly';
  /** Capsules only: `sealed`, `delivering`, `delivered` or `opened`. */
  capsuleState: string | null;
  person: CalendarPerson | null;
}
