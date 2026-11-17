import { z } from 'zod';

import { EVENT_TYPE, RECURRENCE } from '../shared/enums.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date, YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'is not a real date');

const memberIds = z
  .array(z.string().uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'must not repeat a person');

const fields = {
  title: z.string().trim().min(1, 'is required').max(200),
  type: z.enum(EVENT_TYPE),
  /** The first occurrence. A yearly birthday's is the day of birth. */
  eventDate: isoDate,
  recurrence: z.enum(RECURRENCE),
  allDay: z.boolean(),
  notes: z.string().trim().max(5000).nullable(),
  /** The people the occasion is about. Replaced as a whole on PATCH. */
  memberIds,
};

export const createEventSchema = z
  .object({
    title: fields.title,
    type: fields.type.default('custom'),
    eventDate: fields.eventDate,
    recurrence: fields.recurrence.default('none'),
    allDay: fields.allDay.default(true),
    notes: fields.notes.optional(),
    memberIds: fields.memberIds.default([]),
  })
  .strict();
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: fields.title.optional(),
    type: fields.type.optional(),
    eventDate: fields.eventDate.optional(),
    recurrence: fields.recurrence.optional(),
    allDay: fields.allDay.optional(),
    notes: fields.notes.optional(),
    memberIds: fields.memberIds.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'send at least one field' });
export type UpdateEventDto = z.infer<typeof updateEventSchema>;

export const listEventsSchema = z.object({
  type: z.enum(EVENT_TYPE).optional(),
  memberId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListEventsDto = z.infer<typeof listEventsSchema>;
