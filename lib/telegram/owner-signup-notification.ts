import "server-only";

import { after } from "next/server";

import { loadPlatformSummary, type PlatformSummary } from "@/lib/admin/platform-summary";
import { formatOwnerSignupMessage } from "@/lib/telegram/format";
import { notifyOwners } from "@/lib/telegram/notify";
import type { MarketingAttributionPayload } from "@/lib/validation/marketing-attribution";

type RequestedSignupPlan = "starter" | "professional";
type NotifyStats = { attempted: number; sent: number; failed: number };

export type OwnerSignupNotificationInput = {
  userId: string;
  companyId?: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  requestedPlan: RequestedSignupPlan;
  marketingAttribution?: MarketingAttributionPayload | null;
};

type OwnerSignupNotificationDeps = {
  loadPlatformSummary?: () => Promise<PlatformSummary>;
  notifyOwners?: (text: string) => Promise<NotifyStats>;
  formatOwnerSignupMessage?: typeof formatOwnerSignupMessage;
  summaryTimeoutMs?: number;
  deliveryTimeoutMs?: number;
};

type OwnerSignupNotificationScheduler = (callback: () => void | Promise<void>) => void;

type OwnerSignupNotificationScheduleOptions = {
  defer?: OwnerSignupNotificationScheduler;
  notifier?: (input: OwnerSignupNotificationInput) => Promise<NotifyStats>;
  shouldNotify?: () => boolean | Promise<boolean>;
  guardTimeoutMs?: number;
};

const EMPTY_NOTIFY_STATS: NotifyStats = { attempted: 0, sent: 0, failed: 0 };
const OWNER_SIGNUP_SUMMARY_TIMEOUT_MS = 3000;
const OWNER_SIGNUP_GUARD_TIMEOUT_MS = 1500;
const OWNER_SIGNUP_DELIVERY_TIMEOUT_MS = 5000;

async function loadSummaryBestEffort(loader: () => Promise<PlatformSummary>, timeoutMs: number) {
  try {
    return await withTimeout(loader(), timeoutMs);
  } catch {
    return null;
  }
}

export async function notifyOwnerSignupCreated(
  input: OwnerSignupNotificationInput,
  deps: OwnerSignupNotificationDeps = {},
): Promise<NotifyStats> {
  try {
    const summary = await loadSummaryBestEffort(
      deps.loadPlatformSummary ?? loadPlatformSummary,
      deps.summaryTimeoutMs ?? OWNER_SIGNUP_SUMMARY_TIMEOUT_MS,
    );
    const formatMessage = deps.formatOwnerSignupMessage ?? formatOwnerSignupMessage;
    const text = formatMessage({
      ...input,
      platformSummary: summary,
    });
    return await withTimeout(
      (deps.notifyOwners ?? notifyOwners)(text),
      deps.deliveryTimeoutMs ?? OWNER_SIGNUP_DELIVERY_TIMEOUT_MS,
    );
  } catch {
    return EMPTY_NOTIFY_STATS;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("OWNER_SIGNUP_NOTIFICATION_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function scheduleOwnerSignupNotification(
  input: OwnerSignupNotificationInput,
  options: OwnerSignupNotificationScheduleOptions = {},
) {
  const defer = options.defer ?? after;
  const notifier = options.notifier ?? notifyOwnerSignupCreated;
  const shouldNotify = options.shouldNotify ?? (() => true);
  try {
    defer(async () => {
      await Promise.resolve()
        .then(() => withTimeout(Promise.resolve().then(() => shouldNotify()), options.guardTimeoutMs ?? OWNER_SIGNUP_GUARD_TIMEOUT_MS))
        .then(async (allowed) => {
          if (!allowed) return;
          await notifier(input);
        })
        .catch(() => undefined);
    });
  } catch {
    // Notification scheduling must never break signup.
  }
}
