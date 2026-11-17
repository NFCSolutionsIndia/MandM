import type { INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { connect, disconnect, resetDatabase, type Harness } from './support/database.js';

/**
 * BE-04 (People API) and the Events API, through HTTP.
 *
 * test/people.e2e-spec.ts proves the row-level security underneath. This
 * proves the endpoints: the contract, the 404s across owners, the 409 that
 * protects capsules, and the 422 that keeps milestone capsules honest.
 */
describe('people and events API, end to end', () => {
  let app: INestApplication;
  let harness: Harness;
  const CODE = '424242';

  type Session = { token: string; id: string };
  let a: Session;
  let b: Session;

  async function signUp(email: string): Promise<Session> {
    await harness.ownerPool.query(
      `INSERT INTO email_otps (id, email, code_hash, expires_at)
       VALUES (uuid_generate_v7(), $1, $2, now() + interval '10 minutes')`,
      [email, hashToken(CODE)],
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ email, code: CODE })
      .expect(200);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  const http = () => request(app.getHttpServer());
  const as = (s: Session) => ({
    get: (path: string) => http().get(`/api/v1${path}`).set('Authorization', `Bearer ${s.token}`),
    post: (path: string, body?: object) =>
      http().post(`/api/v1${path}`).set('Authorization', `Bearer ${s.token}`).send(body ?? {}),
    patch: (path: string, body: unknown) =>
      http().patch(`/api/v1${path}`).set('Authorization', `Bearer ${s.token}`).send(body as object),
    delete: (path: string) => http().delete(`/api/v1${path}`).set('Authorization', `Bearer ${s.token}`),
  });

  /** `YYYY-MM-DD`, `days` from today in Asia/Kolkata (the users' default zone). */
  function kolkataDate(days: number, yearsBack = 0): string {
    const now = new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000);
    now.setUTCFullYear(now.getUTCFullYear() - yearsBack);
    return now.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    harness = await connect();
    await resetDatabase(harness.ownerPool);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    a = await signUp('a@example.com');
    b = await signUp('b@example.com');
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(harness.ownerPool);
    await disconnect(harness);
  });

  const ids: Record<string, string> = {};

  // ═══ People ════════════════════════════════════════════════════════════════

  it('step 1: POST /members creates Aarav (son, 2012-05-04, day): 201', async () => {
    const res = await as(a)
      .post('/members', {
        name: 'Aarav', relationship: 'son', birthday: '2012-05-04', birthdayPrecision: 'day',
        anniversary: null, phone: '+919876543210', email: 'Aarav@Example.com',
        notes: 'Loves cricket', avatarMediaId: null,
      })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Aarav', relationship: 'son', relationshipLabel: null,
      birthday: '2012-05-04', birthdayPrecision: 'day', anniversary: null,
      phone: '+919876543210', email: 'aarav@example.com', notes: 'Loves cricket',
      avatarMediaId: null, avatarUrl: null, deceasedAt: null,
      occasions: { anniversary: null, events: [] },
      capsules: { milestone: 0, pendingDeliveries: 0, delivered: 0 },
    });
    expect(res.body.occasions.birthday.date).toMatch(/-05-04$/);
    expect(res.body.occasions.birthday.turns).toBeGreaterThanOrEqual(14);
    ids.aarav = res.body.id;
  });

  it('a birthday with no precision is taken as known to the day', async () => {
    const res = await as(a).post('/members', { name: 'Mom', birthday: '1960-06-22' }).expect(201);
    expect(res.body.birthdayPrecision).toBe('day');
    ids.mom = res.body.id;
  });

  it('free text relationship only with "other"', async () => {
    const ok = await as(a)
      .post('/members', { name: 'Kavya', relationship: 'other', relationshipLabel: 'school friend' })
      .expect(201);
    expect(ok.body).toMatchObject({ relationship: 'other', relationshipLabel: 'school friend' });
    ids.kavya = ok.body.id;

    const bad = await as(a)
      .post('/members', { name: 'X', relationship: 'friend', relationshipLabel: 'best friend' })
      .expect(422);
    expect(bad.body.errors[0].field).toBe('relationshipLabel');
    await as(a).post('/members', { name: 'X', relationship: 'uncle' }).expect(422);
  });

  it.each([
    [{ name: '' }, 'name'],
    [{ name: 'X', birthday: '2012-02-30' }, 'birthday'],
    [{ name: 'X', birthday: '2999-01-01' }, 'birthday'],
    [{ name: 'X', birthdayPrecision: 'day' }, 'birthdayPrecision'],
    [{ name: 'X', phone: '98765' }, 'phone'],
    [{ name: 'X', email: 'nope' }, 'email'],
    [{ name: 'X', avatarMediaId: 'not-a-uuid' }, 'avatarMediaId'],
    // The owner comes from the session, never the body.
    [{ name: 'X', ownerId: '01900000-0000-7000-8000-000000000001' }, '(root)'],
  ])('POST %j is 422 on %s', async (body, field) => {
    const res = await as(a).post('/members', body).expect(422);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it('an avatar must be a photo the user can see', async () => {
    const res = await as(a)
      .post('/members', { name: 'X', avatarMediaId: '01900000-0000-7000-8000-0000000000ff' })
      .expect(422);
    expect(res.body.errors[0].field).toBe('avatarMediaId');
  });

  it('step 2: GET /members?q=aar lists Aarav', async () => {
    const res = await as(a).get('/members?q=aar').expect(200);
    expect(res.body.items.map((m: { name: string }) => m.name)).toEqual(['Aarav']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('q treats % and _ as plain text', async () => {
    const res = await as(a).get('/members?q=%25').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('cursor paging walks every person once, by name', async () => {
    for (let i = 0; i < 23; i++) {
      await as(a).post('/members', { name: `Person ${String(i).padStart(2, '0')}` }).expect(201);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await as(a)
        .get(`/members?limit=10${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200);
      seen.push(...res.body.items.map((m: { name: string }) => m.name));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(26);
    expect(new Set(seen).size).toBe(26);
    expect(seen).toEqual([...seen].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it('a cursor that was not issued is 400; limit is 1–100', async () => {
    await as(a).get('/members?cursor=garbage').expect(400);
    await as(a).get('/members?limit=0').expect(400);
    await as(a).get('/members?limit=101').expect(400);
  });

  it('step 3: user B cannot see, change or delete Aarav: 404', async () => {
    await as(b).get(`/members/${ids.aarav}`).expect(404);
    await as(b).patch(`/members/${ids.aarav}`, { name: 'Mine now' }).expect(404);
    await as(b).delete(`/members/${ids.aarav}`).expect(404);
    const list = await as(b).get('/members').expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('a malformed id is 404; no session is 401', async () => {
    await as(a).get('/members/not-a-uuid').expect(404);
    await http().get('/api/v1/members').expect(401);
    await http().get('/api/v1/events').expect(401);
  });

  it('PATCH changes only what is sent; null clears', async () => {
    const res = await as(a)
      .patch(`/members/${ids.kavya}`, { notes: 'Met at school', relationship: 'friend' })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Kavya', notes: 'Met at school', relationship: 'friend', relationshipLabel: null,
    });
    const cleared = await as(a).patch(`/members/${ids.kavya}`, { notes: null }).expect(200);
    expect(cleared.body.notes).toBeNull();
    await as(a).patch(`/members/${ids.kavya}`, {}).expect(422);
  });

  it('PATCH with a precision but no birthday is 422', async () => {
    await as(a).patch(`/members/${ids.kavya}`, { birthdayPrecision: 'year' }).expect(422);
  });

  it('DELETE a person with nothing depending on them: 204, then 404', async () => {
    const tmp = await as(a).post('/members', { name: 'Temporary' }).expect(201);
    await as(a).delete(`/members/${tmp.body.id}`).expect(204);
    await as(a).get(`/members/${tmp.body.id}`).expect(404);
  });

  // ═══ Capsules that depend on people ═══════════════════════════════════════

  let vaultId: string;

  function milestoneCapsule(memberId: string) {
    return as(a).post(`/vaults/${vaultId}/capsules`, {
      title: 'For your 18th', unlockKind: 'milestone', milestoneMemberId: memberId,
      milestoneSpec: { age: 18 },
    });
  }

  async function seal(capsuleId: string) {
    await as(a)
      .post(`/capsules/${capsuleId}/recipients`, { name: 'Recipient', email: 'r@example.com' })
      .expect(201);
    return as(a).post(`/capsules/${capsuleId}/seal`);
  }

  it('step 4: a sealed milestone capsule blocks deleting Aarav: 409 with its id', async () => {
    const v = await as(a).post('/vaults', { name: 'Family' }).expect(201);
    vaultId = v.body.id;

    const cap = await milestoneCapsule(ids.aarav).expect(201);
    ids.capsule = cap.body.id;
    const sealed = await seal(ids.capsule);
    expect(sealed.status).toBe(200);

    const res = await as(a).delete(`/members/${ids.aarav}`).expect(409);
    expect(res.body).toMatchObject({ reason: 'member_has_capsules', capsuleIds: [ids.capsule] });

    const detail = await as(a).get(`/members/${ids.aarav}`).expect(200);
    expect(detail.body.capsules.milestone).toBe(1);
  });

  it('…and its birthday cannot be made vague or moved while sealed', async () => {
    const vague = await as(a)
      .patch(`/members/${ids.aarav}`, { birthdayPrecision: 'year' })
      .expect(409);
    expect(vague.body.capsuleIds).toEqual([ids.capsule]);
    await as(a).patch(`/members/${ids.aarav}`, { birthday: '2012-05-05' }).expect(409);
    // Anything else about him can still change.
    await as(a).patch(`/members/${ids.aarav}`, { notes: 'Plays the tabla too' }).expect(200);
  });

  it('step 5: a person known only to the year cannot have a milestone capsule: 422', async () => {
    const g = await as(a)
      .post('/members', { name: 'Grandma', birthday: '1940-01-01', birthdayPrecision: 'year' })
      .expect(201);
    const res = await milestoneCapsule(g.body.id).expect(422);
    expect(res.body.reason).toBe('milestone_birthday_unknown');

    const none = await as(a).post('/members', { name: 'No birthday' }).expect(201);
    await milestoneCapsule(none.body.id).expect(422);
  });

  it('sealing re-checks: a birthday made vague after drafting is 422 at seal', async () => {
    const p = await as(a)
      .post('/members', { name: 'Ishaan', birthday: '2015-08-15', birthdayPrecision: 'day' })
      .expect(201);
    const cap = await milestoneCapsule(p.body.id).expect(201);
    // Only a draft depends on it, so the change is allowed…
    await as(a).patch(`/members/${p.body.id}`, { birthdayPrecision: 'month' }).expect(200);
    // …and the seal is what refuses.
    const res = await seal(cap.body.id);
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('milestone_birthday_unknown');
  });

  it('somebody else’s person cannot be a milestone: 422', async () => {
    const theirs = await as(b).post('/members', { name: 'Theirs', birthday: '2010-01-01' }).expect(201);
    const res = await milestoneCapsule(theirs.body.id).expect(422);
    expect(res.body.reason).toBe('milestone_member_not_found');
  });

  it('a pending delivery to a person blocks deleting them: 409', async () => {
    const p = await as(a).post('/members', { name: 'Recipient person' }).expect(201);
    const cap = await as(a)
      .post(`/vaults/${vaultId}/capsules`, {
        title: 'Soon', unlockAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      .expect(201);
    await as(a)
      .post(`/capsules/${cap.body.id}/recipients`, { name: 'R', email: 'rp@example.com', memberId: p.body.id })
      .expect(201);
    await as(a).post(`/capsules/${cap.body.id}/seal`).expect(200);

    const res = await as(a).delete(`/members/${p.body.id}`).expect(409);
    expect(res.body.capsuleIds).toEqual([cap.body.id]);
    const detail = await as(a).get(`/members/${p.body.id}`).expect(200);
    expect(detail.body.capsules.pendingDeliveries).toBe(1);
  });

  // ═══ Events ═══════════════════════════════════════════════════════════════

  it('POST /events with people: 201, with the next occurrence', async () => {
    const res = await as(a)
      .post('/events', {
        title: 'Mom & Dad’s wedding', type: 'anniversary', eventDate: '1988-12-01',
        recurrence: 'yearly', memberIds: [ids.mom, ids.kavya],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      title: 'Mom & Dad’s wedding', type: 'anniversary', eventDate: '1988-12-01',
      recurrence: 'yearly', allDay: true, notes: null, archivedAt: null,
      members: [{ id: ids.kavya, name: 'Kavya' }, { id: ids.mom, name: 'Mom' }],
    });
    expect(res.body.nextOccurrence).toMatch(/-12-01$/);
    expect(res.body.daysLeft).toBeGreaterThanOrEqual(0);
    ids.wedding = res.body.id;
  });

  it('defaults: custom, one-off, all day', async () => {
    const res = await as(a)
      .post('/events', { title: 'Housewarming', eventDate: kolkataDate(10) })
      .expect(201);
    expect(res.body).toMatchObject({ type: 'custom', recurrence: 'none', allDay: true, daysLeft: 10 });
    ids.housewarming = res.body.id;
  });

  it('a one-off event in the past has no next occurrence', async () => {
    const res = await as(a).post('/events', { title: 'Last week', eventDate: kolkataDate(-7) }).expect(201);
    expect(res.body).toMatchObject({ nextOccurrence: null, daysLeft: null });
  });

  it.each([
    [{ title: 'X' }, 'eventDate'],
    [{ title: '', eventDate: '2026-01-01' }, 'title'],
    [{ title: 'X', eventDate: '2026-13-01' }, 'eventDate'],
    [{ title: 'X', eventDate: '2026-01-01', type: 'party' }, 'type'],
    [{ title: 'X', eventDate: '2026-01-01', recurrence: 'weekly' }, 'recurrence'],
    [{ title: 'X', eventDate: '2026-01-01', ownerId: 'x' }, '(root)'],
  ])('POST /events %j is 422 on %s', async (body, field) => {
    const res = await as(a).post('/events', body).expect(422);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it('only your own people can be on your event: 422', async () => {
    const theirs = await as(b).post('/members', { name: 'B person' }).expect(201);
    const res = await as(a)
      .post('/events', { title: 'X', eventDate: '2026-01-01', memberIds: [theirs.body.id] })
      .expect(422);
    expect(res.body.errors[0].field).toBe('memberIds');
    await as(a)
      .post('/events', { title: 'X', eventDate: '2026-01-01', memberIds: [ids.mom, ids.mom] })
      .expect(422);
  });

  it('GET /events filters by type and person; GET /events/:id', async () => {
    const byType = await as(a).get('/events?type=anniversary').expect(200);
    expect(byType.body.items.map((e: { id: string }) => e.id)).toEqual([ids.wedding]);
    const byPerson = await as(a).get(`/events?memberId=${ids.mom}`).expect(200);
    expect(byPerson.body.items.map((e: { id: string }) => e.id)).toEqual([ids.wedding]);
    const one = await as(a).get(`/events/${ids.housewarming}`).expect(200);
    expect(one.body.title).toBe('Housewarming');
  });

  it('the person’s page shows their events', async () => {
    const res = await as(a).get(`/members/${ids.mom}`).expect(200);
    expect(res.body.occasions.events).toEqual([
      expect.objectContaining({ id: ids.wedding, type: 'anniversary' }),
    ]);
  });

  it('PATCH an event; memberIds replaces the list', async () => {
    const res = await as(a)
      .patch(`/events/${ids.wedding}`, { title: 'Parents’ wedding', memberIds: [ids.mom] })
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Parents’ wedding', members: [{ id: ids.mom, name: 'Mom' }] });
    const none = await as(a).patch(`/events/${ids.wedding}`, { memberIds: [] }).expect(200);
    expect(none.body.members).toEqual([]);
  });

  it('events are paged by date', async () => {
    for (let i = 1; i <= 5; i++) {
      await as(a).post('/events', { title: `E${i}`, eventDate: `2027-0${i}-01` }).expect(201);
    }
    const first = await as(a).get('/events?limit=3').expect(200);
    const second = await as(a).get(`/events?limit=3&cursor=${first.body.nextCursor}`).expect(200);
    const dates = [...first.body.items, ...second.body.items].map((e: { eventDate: string }) => e.eventDate);
    expect(dates).toEqual([...dates].sort());
    expect(new Set([...first.body.items, ...second.body.items].map((e: { id: string }) => e.id)).size).toBe(6);
  });

  it('DELETE archives; ?archived=true lists it; restore brings it back', async () => {
    await as(a).delete(`/events/${ids.housewarming}`).expect(204);
    await as(a).delete(`/events/${ids.housewarming}`).expect(204);
    const active = await as(a).get('/events?limit=100').expect(200);
    expect(active.body.items.map((e: { id: string }) => e.id)).not.toContain(ids.housewarming);
    const archived = await as(a).get('/events?archived=true').expect(200);
    expect(archived.body.items.map((e: { id: string }) => e.id)).toEqual([ids.housewarming]);
    expect(archived.body.items[0].archivedAt).not.toBeNull();

    const restored = await as(a).post(`/events/${ids.housewarming}/restore`).expect(200);
    expect(restored.body.archivedAt).toBeNull();
  });

  it('user B cannot see or touch A’s events: 404', async () => {
    await as(b).get(`/events/${ids.wedding}`).expect(404);
    await as(b).patch(`/events/${ids.wedding}`, { title: 'x' }).expect(404);
    await as(b).delete(`/events/${ids.wedding}`).expect(404);
    await as(b).post(`/events/${ids.wedding}/restore`).expect(404);
    const list = await as(b).get('/events').expect(200);
    expect(list.body.items).toEqual([]);
  });

  // ═══ And the Home screen sees all of it ═══════════════════════════════════

  it('/moments/upcoming shows people and events created through the API', async () => {
    const c = await signUp('c@example.com');
    await as(c).post('/members', { name: 'Ravi', birthday: kolkataDate(7, 40) }).expect(201);
    await as(c).post('/events', { title: 'Trip', eventDate: kolkataDate(3) }).expect(201);
    const res = await as(c).get('/moments/upcoming').expect(200);
    expect(res.body.items.map((i: { title: string; daysLeft: number }) => `${i.daysLeft} ${i.title}`))
      .toEqual(['3 Trip', "7 Ravi's birthday"]);
  });
});
