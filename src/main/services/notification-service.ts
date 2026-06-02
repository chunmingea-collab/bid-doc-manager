import { Notification, BrowserWindow, app } from "electron";
import { checkExpiringDocuments } from "./reminder-service";
import { getSetting, setSetting } from "./settings-service";
import { logger } from "./logger";
import { isReady as isActiveProfileReady } from "../../utils/prisma";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  bucket: "overdue" | "30days" | "60days" | "90days";
  count: number;
  firedAt: string; // ISO
}

const RECENT: NotificationItem[] = [];
const MAX_RECENT = 50;

export function getRecentNotifications(): NotificationItem[] {
  return [...RECENT].reverse();
}

function pushRecent(item: NotificationItem): void {
  RECENT.push(item);
  if (RECENT.length > MAX_RECENT) RECENT.shift();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notification:new", item);
  }
}

function fireNative(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    silent: false,
  });
  n.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send("notification:open", { route: "/dashboard" });
    } else {
      app.focus();
    }
  });
  n.show();
}

const BUCKET_LABELS: Record<NotificationItem["bucket"], string> = {
  overdue: "已过期",
  "30days": "30 天内到期",
  "60days": "60 天内到期",
  "90days": "90 天内到期",
};

/** Run an immediate reminder check and surface as both native + in-app notifications. */
export async function runReminderCheckAndNotify(force = false): Promise<NotificationItem[]> {
  // No active profile yet (the wizard hasn't run). The placeholder DB has no
  // tables — skip silently rather than logging a Prisma "no such table" error.
  if (!isActiveProfileReady()) return [];

  const enabled = await getSetting("reminderEnabled");
  if (!enabled && !force) return [];

  const enabledDays = await getSetting("reminderDays");
  const result = await checkExpiringDocuments();

  const items: NotificationItem[] = [];
  const buckets: Array<{ key: NotificationItem["bucket"]; days: number; docs: typeof result.overdue }> = [
    { key: "overdue", days: 0, docs: result.overdue },
    { key: "30days", days: 30, docs: result.within30Days },
    { key: "60days", days: 60, docs: result.within60Days },
    { key: "90days", days: 90, docs: result.within90Days },
  ];

  for (const b of buckets) {
    if (b.docs.length === 0) continue;
    if (b.key !== "overdue" && !enabledDays.includes(b.days)) continue;

    const item: NotificationItem = {
      id: `${b.key}-${Date.now()}`,
      title: `${BUCKET_LABELS[b.key]} (${b.docs.length})`,
      body: b.docs
        .slice(0, 3)
        .map((d) => d.fileName)
        .join("、") + (b.docs.length > 3 ? ` 等 ${b.docs.length} 份资料` : ""),
      bucket: b.key,
      count: b.docs.length,
      firedAt: new Date().toISOString(),
    };
    items.push(item);
    pushRecent(item);
    fireNative(item.title, item.body);
  }

  return items;
}

let scheduledHandle: { stop: () => void } | null = null;

/** Start the daily reminder schedule. Idempotent.
 *  Fires once at app start, then at the user-configured `reminderHour`
 *  every day. Re-call this on settings change to re-arm. */
export async function startNotificationSchedule(): Promise<void> {
  // No active profile yet (the wizard hasn't run). The placeholder DB has
  // no tables — skip silently rather than logging Prisma errors.
  if (!isActiveProfileReady()) {
    scheduledHandle = null;
    return;
  }
  scheduledHandle?.stop();
  const enabled = await getSetting("reminderEnabled");
  if (!enabled) {
    scheduledHandle = null;
    return;
  }
  scheduledHandle = scheduleDailyReminderAtUserHour();
}

export function stopNotificationSchedule(): void {
  scheduledHandle?.stop();
  scheduledHandle = null;
}

/**
 * Daily scheduler that respects the user's `reminderHour` setting.
 * First runs immediately on start, then once per day at the configured hour.
 * Each fire re-arms the next day's timer so the user can change the hour
 * at runtime (a fresh `startNotificationSchedule()` will replace this).
 */
function scheduleDailyReminderAtUserHour(): { stop: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let stopped = false;

  const fire = async () => {
    if (stopped) return;
    try {
      await runReminderCheckAndNotify();
    } catch (err) {
      logger.error("[notification] reminder check failed:", err);
    }
    arm();
  };

  const arm = async () => {
    if (stopped) return;
    const hour = await getSetting("reminderHour");
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    timeout = setTimeout(fire, delay);
  };

  // Fire immediately on start so the user gets feedback without waiting
  void fire();

  return {
    stop: () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    },
  };
}

export async function maybeShowStartupReminder(): Promise<NotificationItem | null> {
  if (!isActiveProfileReady()) return null;

  const enabled = await getSetting("startupReminderEnabled");
  if (!enabled) return null;

  const today = new Date().toISOString().slice(0, 10);
  const last = await getSetting("lastReminderShownDate");
  if (last === today) return null;

  const result = await checkExpiringDocuments();
  const total = result.overdue.length + result.within30Days.length;
  if (total === 0) return null;

  await setSetting("lastReminderShownDate", today);
  const item: NotificationItem = {
    id: `startup-${Date.now()}`,
    title: `资料到期提醒`,
    body: `${result.overdue.length} 份已过期、${result.within30Days.length} 份将在 30 天内到期`,
    bucket: result.overdue.length > 0 ? "overdue" : "30days",
    count: total,
    firedAt: new Date().toISOString(),
  };
  pushRecent(item);
  return item;
}
