import React, { useEffect, useState, useCallback } from "react";
import { Badge, Popover, Button, List, Tag, Empty, Typography } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "../types/electron";

const { Text } = Typography;

const BUCKET_COLOR: Record<NotificationItem["bucket"], string> = {
  overdue: "error",
  "30days": "warning",
  "60days": "processing",
  "90days": "success",
};

const BUCKET_LABEL: Record<NotificationItem["bucket"], string> = {
  overdue: "已过期",
  "30days": "30天",
  "60days": "60天",
  "90days": "90天",
};

export default function NotificationCenter(): React.ReactElement {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await window.electronAPI.listNotifications();
      setItems(list);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = window.electronAPI.onNotification((_e, item) => {
      setItems((prev) => [item as NotificationItem, ...prev].slice(0, 50));
    });
    // Once-per-day startup reminder from main process
    const unsubStartup = window.electronAPI.onStartupReminder((_e, item) => {
      setItems((prev) => [item as NotificationItem, ...prev].slice(0, 50));
    });
    return () => {
      unsub();
      unsubStartup();
    };
  }, [load]);

  // Tap a notification → jump to dashboard (the source of all reminders)
  const handleSelect = (item: NotificationItem) => {
    setOpen(false);
    void navigate("/dashboard");
  };

  const unread = items.length;

  const content = (
    <div style={{ width: 320, maxHeight: 400, overflowY: "auto" }}>
      {items.length === 0 ? (
        <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              style={{ padding: "8px 0", cursor: "pointer" }}
              onClick={() => handleSelect(item)}
            >
              <List.Item.Meta
                title={
                  <span>
                    <Tag color={BUCKET_COLOR[item.bucket]}>{BUCKET_LABEL[item.bucket]}</Tag>
                    {item.title}
                  </span>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.body}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>通知中心</span>
          {items.length > 0 && (
            <Button type="link" size="small" onClick={() => setItems([])}>
              清空
            </Button>
          )}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge count={unread} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ color: "#fff", fontSize: 18 }} />}
          style={{ padding: "0 8px" }}
        />
      </Badge>
    </Popover>
  );
}
