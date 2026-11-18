import { z } from 'zod';

import type { NotificationType } from '../shared/enums.js';

/** `GET /notifications?cursor=&limit=20&unread=false`, newest first. */
export const listNotificationsSchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** `true`: only the ones not yet read. */
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;

/** `HH:MM`, 24-hour, as the Settings screen shows it ("10 PM – 7 AM" is 22:00–07:00). */
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time, HH:MM in 24-hour form');

/** `PUT /notifications/preferences/quiet-hours`. Clearing is `DELETE` on the same path. */
export const quietHoursSchema = z
  .object({ start: clock, end: clock })
  .strict()
  .refine((v) => v.start !== v.end, { path: ['end'], message: 'must differ from start' });
export type QuietHoursDto = z.infer<typeof quietHoursSchema>;

/**
 * What a notification row's `payload` may carry. Written by the background
 * jobs that create notifications (see SCREEN_API_MAP.md, task BE-15). Every
 * field is optional, so a row written before a field existed still renders.
 *
 *   title       the bold line: "Mom loved your video"
 *   body        the second line: "Best birthday surprise ever!"
 *   memberId    the person it is about, for the avatar on the left
 *   actorName   a name to show when there is no person record
 */
export interface NotificationPayload {
  title?: string;
  body?: string;
  memberId?: string;
  actorName?: string;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Who it is about, for the avatar. Null when nobody in particular. */
  actor: { memberId: string | null; name: string; avatarUrl: string | null } | null;
  /** Where tapping it goes, e.g. `mm://capsules/<id>`. */
  deepLink: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  /** The full payload, for type-specific rendering (clip counts, buttons). */
  data: NotificationPayload;
}
