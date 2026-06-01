import React, { useEffect, useState } from "react";
import { Card, Button, Space, message, Typography, Spin, Modal } from "antd";
import type { AppSettings } from "../../types/electron";

const { Text, Paragraph } = Typography;

export default function BackupSettings(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    window.electronAPI.getAllSettings().then(setSettings);
  }, []);

  if (!settings) return <Spin />;

  const refreshSettings = async () => {
    setSettings(await window.electronAPI.getAllSettings());
  };

  const handleBackup = async () => {
    const dir = await window.electronAPI.openDirectory();
    if (!dir) return;
    setCreating(true);
    try {
      const result = await window.electronAPI.backupCreate(dir);
      message.success(`备份已创建：${result.filePath}`);
      await refreshSettings();
    } catch (err) {
      message.error(`备份失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = () => {
    Modal.confirm({
      title: "恢复备份将覆盖当前数据",
      content: "请选择 .zip 备份文件。恢复后当前数据库会被替换，此操作不可撤销。",
      okText: "选择文件并恢复",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        const filePath = await window.electronAPI.openFile([{ name: "备份文件", extensions: ["zip"] }]);
        if (!filePath) return;
        setRestoring(true);
        try {
          await window.electronAPI.backupRestore(filePath);
          message.success("恢复成功，请重启应用");
        } catch (err) {
          message.error(`恢复失败: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setRestoring(false);
        }
      },
    });
  };

  return (
    <Card title="备份与恢复" style={{ maxWidth: 720 }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Paragraph type="secondary">
          备份会将整个 SQLite 数据库（包含所有资料元数据、文本、分类与标签）打包为单个 zip
          文件。文件原件不在备份中，请单独保留。
        </Paragraph>

        <div>
          <Text strong>上次备份：</Text>
          <Text>
            {settings.lastBackupAt
              ? `${new Date(settings.lastBackupAt).toLocaleString()} → ${settings.lastBackupPath}`
              : "尚未创建过备份"}
          </Text>
        </div>

        <Space>
          <Button type="primary" loading={creating} onClick={handleBackup}>
            立即备份
          </Button>
          <Button danger loading={restoring} onClick={handleRestore}>
            从备份恢复
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
