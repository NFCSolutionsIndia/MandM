import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who the current request is acting as.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This exists so that a handler CANNOT forget to identify the actor.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The database decides what a user may see (migration 0002), but it can only
 * do that if somebody tells it who is asking. If that "somebody" were an
 * argument threaded through every service call, it would be forgotten exactly
 * once — and the handler that forgot would either see nothing or, in a
 * design without RLS, see everything.
 *
 * `AsyncLocalStorage` is Node's request-scoped storage: a value set at the
 * edge of a request stays visible to every `await` beneath it, and is invisible
 * to every other request on the same process. It is the only way to carry this
 * safely without passing it by hand.
 *
 * Why not a NestJS request-scoped provider: Nest would rebuild the entire
 * dependency chain of every provider that touches it, once per request. That
 * cost lands on the hottest path in the service, and buys nothing this does
 * not already give.
 */
interface Actor {
  /** The authenticated user's id, as a uuid string. */
  readonly userId: string;
}

const storage = new AsyncLocalStorage<Actor>();

/**
 * The console’s actor, kept in its OWN storage.
 *
 * Not a field on `Actor`, and not the same setting in the database. One
 * request is never both a user and an admin, and sharing the slot would
 * mean an admin session could satisfy a user policy — which is exactly the
 * boundary `admin_users` exists to draw.
 */
interface AdminActor {
  readonly adminId: string;
}

const adminStorage = new AsyncLocalStorage<AdminActor>();

export const ActorContext = {
  /**
   * Run `fn` with `userId` as the actor. Everything awaited inside — however
   * deep — sees it.
   *
   * Called once per request, by the authentication layer, and nowhere else.
   */
  run<T>(userId: string, fn: () => T): T {
    return storage.run({ userId }, fn);
  },

  /**
   * The current actor, or `null` outside a request — a background job, a
   * startup task, a test.
   *
   * **`null` is not an error here.** It travels down to the database as an
   * unset `app.user_id`, and every policy denies by default, so unauthenticated
   * work sees nothing rather than everything. Failing closed is the whole
   * point; raising here would only tempt someone into a default.
   */
  userId(): string | null {
    return storage.getStore()?.userId ?? null;
  },
};

/** The same contract, for the console. */
export const AdminContext = {
  run<T>(adminId: string, fn: () => T): T {
    return adminStorage.run({ adminId }, fn);
  },

  adminId(): string | null {
    return adminStorage.getStore()?.adminId ?? null;
  },
};
