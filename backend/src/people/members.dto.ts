import { z } from 'zod';

import { OCCURRED_PRECISION } from '../shared/enums.js';

/**
 * The relationship vocabulary (BE-04). Free text only with `other`, carried
 * in `relationshipLabel`.
 *
 * Stored in ONE column, `members.relationship`: a listed value as itself, an
 * `other` as its label (or `other` with none). Reading back, anything not in
 * this list is `other` + label — so rows written before this list existed
 * still read sensibly.
 */
export const RELATIONSHIPS = [
  'mother', 'father', 'son', 'daughter', 'spouse', 'partner', 'brother',
  'sister', 'grandparent', 'grandchild', 'friend', 'other',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date, YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'is not a real date');

/** Dates of people: real, and not in the future. */
const pastDate = isoDate.refine(
  (s) => s <= new Date().toISOString().slice(0, 10),
  'cannot be in the future',
);

const fields = {
  name: z.string().trim().min(1, 'is required').max(200),
  relationship: z.enum(RELATIONSHIPS).nullable(),
  relationshipLabel: z.string().trim().min(1).max(64).nullable(),
  birthday: pastDate.nullable(),
  birthdayPrecision: z.enum(OCCURRED_PRECISION).nullable(),
  anniversary: pastDate.nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'must be in international format, e.g. +919876543210')
    .nullable(),
  email: z.string().trim().toLowerCase().email().max(320).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  avatarMediaId: z.string().uuid().nullable(),
  deceasedAt: z.coerce.date().nullable(),
};

type Relational = { relationship?: Relationship | null; relationshipLabel?: string | null };

const labelOnlyWithOther = (v: Relational) =>
  v.relationshipLabel == null || v.relationship === 'other';
const labelRule = {
  path: ['relationshipLabel'],
  message: 'is only allowed when relationship is "other"',
};

const precisionNeedsBirthday = (v: { birthday?: string | null; birthdayPrecision?: string | null }) =>
  !(v.birthdayPrecision != null && v.birthday === null);
const precisionRule = { path: ['birthdayPrecision'], message: 'needs a birthday' };

export const createMemberSchema = z
  .object({
    name: fields.name,
    relationship: fields.relationship.optional(),
    relationshipLabel: fields.relationshipLabel.optional(),
    birthday: fields.birthday.optional(),
    birthdayPrecision: fields.birthdayPrecision.optional(),
    anniversary: fields.anniversary.optional(),
    phone: fields.phone.optional(),
    email: fields.email.optional(),
    notes: fields.notes.optional(),
    avatarMediaId: fields.avatarMediaId.optional(),
    deceasedAt: fields.deceasedAt.optional(),
  })
  .strict()
  .refine(labelOnlyWithOther, labelRule)
  .refine(
    (v) => !(v.birthdayPrecision != null && v.birthday == null),
    precisionRule,
  );
export type CreateMemberDto = z.infer<typeof createMemberSchema>;

/** Every field optional; `null` clears it. */
export const updateMemberSchema = z
  .object({
    name: fields.name.optional(),
    relationship: fields.relationship.optional(),
    relationshipLabel: fields.relationshipLabel.optional(),
    birthday: fields.birthday.optional(),
    birthdayPrecision: fields.birthdayPrecision.optional(),
    anniversary: fields.anniversary.optional(),
    phone: fields.phone.optional(),
    email: fields.email.optional(),
    notes: fields.notes.optional(),
    avatarMediaId: fields.avatarMediaId.optional(),
    deceasedAt: fields.deceasedAt.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'send at least one field' })
  // A label changes the relationship, so it must say which: send both.
  .refine(labelOnlyWithOther, labelRule)
  .refine(precisionNeedsBirthday, precisionRule);
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;

export const listMembersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListMembersDto = z.infer<typeof listMembersSchema>;

/** What `members.relationship` holds, for a request's pair. */
export function storedRelationship(
  relationship: Relationship | null | undefined,
  label: string | null | undefined,
): string | null {
  if (relationship == null) return null;
  return relationship === 'other' && label ? label : relationship;
}

/** The pair, for what `members.relationship` holds. */
export function readRelationship(stored: string | null): {
  relationship: Relationship | null;
  relationshipLabel: string | null;
} {
  if (stored === null) return { relationship: null, relationshipLabel: null };
  if ((RELATIONSHIPS as readonly string[]).includes(stored)) {
    return { relationship: stored as Relationship, relationshipLabel: null };
  }
  return { relationship: 'other', relationshipLabel: stored };
}
