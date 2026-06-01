import { prisma } from "../../utils/prisma";

/**
 * Whitelisted user-preference keys with their default values and JSON-shape.
 * Add a key here, get a typed get/set out of the box.
 */
export const SETTINGS_DEFAULTS = {
  reminderDays: [30, 60, 90] as number[],
  reminderEnabled: true as boolean,
  reminderHour: 9 as number,
  startupReminderEnabled: true as boolean,
  importMaxFileSizeMb: 100 as number,
  importConcurrency: 4 as number,
  autoBackupOnQuit: false as boolean,
  lastReminderShownDate: "" as string,
  lastBackupAt: "" as string,
  lastBackupPath: "" as string,
} satisfies Record<string, unknown>;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS_DEFAULTS)[K];

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return SETTINGS_DEFAULTS[key];
  try {
    return JSON.parse(row.value) as SettingValue<K>;
  } catch {
    return SETTINGS_DEFAULTS[key];
  }
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

export async function getAllSettings(): Promise<typeof SETTINGS_DEFAULTS> {
  const rows = await prisma.setting.findMany();
  const result = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (row.key in SETTINGS_DEFAULTS) {
      try {
        (result as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        // keep default
      }
    }
  }
  return result;
}
