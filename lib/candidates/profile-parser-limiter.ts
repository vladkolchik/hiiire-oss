export class ProfileParserLimiterError extends Error {
  readonly reason: "deadline_exceeded" | "queue_timeout";

  constructor(reason: "deadline_exceeded" | "queue_timeout") {
    super(`profile_parser_${reason}`);
    this.name = "ProfileParserLimiterError";
    this.reason = reason;
  }
}

type SemaphoreWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  limit: number;
  timer: ReturnType<typeof setTimeout> | null;
};

type SemaphoreOptions = {
  limit: number;
  queueTimeoutMs: number;
  deadlineAt?: number;
  now?: () => number;
};

let activeSemaphoreSlots = 0;
const semaphoreQueue: SemaphoreWaiter[] = [];
const keyedMutexes = new Map<string, Promise<void>>();

export async function withProfileParserSemaphore<T>(options: SemaphoreOptions, fn: () => Promise<T>): Promise<T> {
  const release = await acquireSemaphore(options);
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function withKeyedMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = keyedMutexes.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = previous
    .catch(() => {
      // Keep later waiters moving if an earlier task failed.
    })
    .then(
      () =>
        new Promise<void>((resolve) => {
          releaseCurrent = resolve;
        }),
    );

  keyedMutexes.set(key, current);
  await previous.catch(() => {
    // The mutex serializes work; previous failures should not poison this key forever.
  });

  try {
    return await fn();
  } finally {
    releaseCurrent();
    if (keyedMutexes.get(key) === current) {
      keyedMutexes.delete(key);
    }
  }
}

export function clearProfileParserLimitersForTests(): void {
  activeSemaphoreSlots = 0;
  for (const waiter of semaphoreQueue.splice(0)) {
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.reject(new ProfileParserLimiterError("queue_timeout"));
  }
  keyedMutexes.clear();
}

async function acquireSemaphore(options: SemaphoreOptions): Promise<() => void> {
  const now = options.now ?? Date.now;
  const limit = Math.max(1, Math.trunc(options.limit));
  const deadlineAt = options.deadlineAt;
  if (typeof deadlineAt === "number" && now() >= deadlineAt) {
    throw new ProfileParserLimiterError("deadline_exceeded");
  }

  if (activeSemaphoreSlots < limit) {
    activeSemaphoreSlots += 1;
    return releaseSemaphore;
  }

  const queueBudgetMs = Math.max(1, Math.trunc(options.queueTimeoutMs));
  const deadlineBudgetMs = typeof deadlineAt === "number" ? Math.max(0, deadlineAt - now()) : queueBudgetMs;
  const waitMs = Math.min(queueBudgetMs, deadlineBudgetMs);
  if (waitMs <= 0) throw new ProfileParserLimiterError("deadline_exceeded");

  await new Promise<void>((resolve, reject) => {
    const waiter: SemaphoreWaiter = {
      resolve,
      reject,
      limit,
      timer: setTimeout(() => {
        removeWaiter(waiter);
        reject(new ProfileParserLimiterError(typeof deadlineAt === "number" && now() >= deadlineAt ? "deadline_exceeded" : "queue_timeout"));
      }, waitMs),
    };
    semaphoreQueue.push(waiter);
  });

  if (typeof deadlineAt === "number" && now() >= deadlineAt) {
    releaseSemaphore();
    throw new ProfileParserLimiterError("deadline_exceeded");
  }

  return releaseSemaphore;
}

function releaseSemaphore(): void {
  activeSemaphoreSlots = Math.max(0, activeSemaphoreSlots - 1);
  drainSemaphoreQueue();
}

function drainSemaphoreQueue(): void {
  while (semaphoreQueue.length > 0) {
    const waiter = semaphoreQueue[0];
    if (!waiter || activeSemaphoreSlots >= waiter.limit) return;

    semaphoreQueue.shift();
    if (waiter.timer) clearTimeout(waiter.timer);
    activeSemaphoreSlots += 1;
    waiter.resolve();
  }
}

function removeWaiter(waiter: SemaphoreWaiter): void {
  const index = semaphoreQueue.indexOf(waiter);
  if (index >= 0) semaphoreQueue.splice(index, 1);
}
