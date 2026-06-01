import React, { useEffect, useState } from "react";
import { Card, Switch, InputNumber, Button, Checkbox, Space, message, Spin, Typography } from "antd";
import type { AppSettings } from "../../types/electron";

const { Text } = Typography;

const REMINDER_DAY_OPTIONS = [
  { label: "30 天前提醒", value: 30 },
  { label: "60 天前提醒", value: 60 },
  { label: "90 天前提醒", value: 90 },
];

export default function ReminderSettings(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    window.electronAPI.getAllSettings().then(setSettings);
  }, []);

  if (!settings) {
    return <Spin />;
  }

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaving(key);
    try {
      await window.electronAPI.setSetting(key, value);
      setSettings({ ...settings, [key]: value });
      message.success("已保存");
    } catch (err) {
      message.error(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const toggleDay = async (day: number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...settings.reminderDays, day])).sort((a, b) => a - b)
      : settings.reminderDays.filter((d) => d !== day);
    await update("reminderDays", next);
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const items = await window.electronAPI.checkRemindersNow();
      if (items.length === 0) {
        message.info("当前没有需要提醒的资料");
      } else {
        message.success(`已触发 ${items.length} 条通知`);
      }
    } catch (err) {
      message.error(`触发失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card title="到期提醒" style={{ maxWidth: 720 }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Space>
            <Switch
              checked={settings.reminderEnabled}
              loading={saving === "reminderEnabled"}
              onChange={(v) => update("reminderEnabled", v)}
            />
            <Text>启用定期到期检查（每 6 小时一次）</Text>
          </Space>
        </div>

        <div>
          <Text strong>提醒提前天数</Text>
          <div style={{ marginTop: 8 }}>
            <Space direction="vertical">
              {REMINDER_DAY_OPTIONS.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={settings.reminderDays.includes(opt.value)}
                  disabled={saving !== null}
                  onChange={(e) => toggleDay(opt.value, e.target.checked)}
                >
                  {opt.label}
                </Checkbox>
              ))}
            </Space>
          </div>
        </div>

        <div>
          <Space>
            <Text>每日提醒发送时间（小时，0–23）</Text>
            <InputNumber
              min={0}
              max={23}
              value={settings.reminderHour}
              disabled={saving === "reminderHour"}
              onChange={(v) => v !== null && update("reminderHour", v)}
            />
          </Space>
        </div>

        <div>
          <Space>
            <Switch
              checked={settings.startupReminderEnabled}
              loading={saving === "startupReminderEnabled"}
              onChange={(v) => update("startupReminderEnabled", v)}
            />
            <Text>启动时弹出当日到期提醒</Text>
          </Space>
        </div>

        <Button type="primary" loading={testing} onClick={runTest}>
          立即检查并触发通知
        </Button>
      </Space>
    </Card>
  );
}
