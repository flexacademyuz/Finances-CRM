/**
 * In-process application events. CRM actions `emit` a fact ("a payment was
 * recorded"); features that care (student notifications today; webhooks,
 * parents, gamification later) subscribe with `on` — so the payment route never
 * needs to know who is listening.
 *
 * Delivery is asynchronous (next tick) and every listener is isolated: a
 * listener that throws or rejects is logged and never affects the emitting
 * request or the other listeners. That is what lets "payment recorded" succeed
 * even when a notification side effect fails.
 */

export type AppEvents = {
  "payment.recorded": { paymentId: string; studentId: string; amount: number; actorUserId: string };
  "payment.voided": { paymentId: string; studentId: string; amount: number; actorUserId: string };
  "attendance.saved": {
    lessonId: string;
    classId: string;
    date: string;
    actorUserId: string;
    /** Only records whose status actually changed (new or different). */
    changed: { studentId: string; status: string; note: string | null }[];
  };
  "lesson.cancelled": { lessonId: string; classId: string; date: string; reason: string; actorUserId: string };
  "score.created": { scoreIds: string[]; actorUserId: string };
  "score.updated": { scoreId: string; actorUserId: string };
  "group.updated": {
    classId: string;
    changes: { schedule?: string | null; room?: string | null; teacherId?: string };
    actorUserId: string;
  };
  "student.movedGroup": { studentId: string; fromClassId: string; toClassId: string; actorUserId: string };
  "discount.created": { discountId: string; studentId: string; actorUserId: string };
  "freeze.created": { freezeId: string; studentId: string; actorUserId: string };
  "freeze.lifted": { freezeId: string; studentId: string; actorUserId: string };
  "student.linked": { studentId: string; telegramAccountId: string };
  "announcement.created": { announcementId: string; actorUserId: string };
};

export type AppEventName = keyof AppEvents;
type Listener<E extends AppEventName> = (payload: AppEvents[E]) => unknown | Promise<unknown>;

const listeners = new Map<AppEventName, Listener<AppEventName>[]>();

export function on<E extends AppEventName>(event: E, fn: Listener<E>): void {
  const list = listeners.get(event) ?? [];
  list.push(fn as Listener<AppEventName>);
  listeners.set(event, list);
}

/** Fire-and-forget: returns immediately; listeners run on the next tick. */
export function emit<E extends AppEventName>(event: E, payload: AppEvents[E]): void {
  const list = listeners.get(event);
  if (!list?.length) return;
  setImmediate(() => {
    for (const fn of list) {
      Promise.resolve()
        .then(() => fn(payload))
        .catch((err) => console.error(`[events] ${event} listener failed:`, (err as Error)?.message ?? err));
    }
  });
}

/** Await all listeners (tests / scripts that need the side effects done). */
export async function emitAndWait<E extends AppEventName>(event: E, payload: AppEvents[E]): Promise<void> {
  const list = listeners.get(event) ?? [];
  await Promise.all(
    list.map((fn) =>
      Promise.resolve()
        .then(() => fn(payload))
        .catch((err) => console.error(`[events] ${event} listener failed:`, (err as Error)?.message ?? err)),
    ),
  );
}

/** Test helper: drop every listener. */
export function clearListeners(): void {
  listeners.clear();
}
