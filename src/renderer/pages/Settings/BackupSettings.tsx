import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Space, message, Typography, Spin, Modal, Form, Select, InputNumber, Switch, Input, Row, Col, Statistic } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import type { AppSettings } from "../../types/electron";
import { formatError } from "../../utils/errors";

const { Text, Paragraph } = Typography;

type Cadence = "off" | "daily" | "weekly" | "onQuit";

const CADENCE_LABEL: Record<Cadence, string> = {
  off: "关闭",
  daily: "每天 03:00",
  weekly: "每周一 03:00",
  onQuit: "仅退出时",
};

export default function BackupSettings(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pickingDir, setPickingDir] = useState(false);
  const [backupFiles, setBackupFiles] = useState<{ name: string; size: number; mtime: number }[]>([]);

  useEffect(() => {
    void (async () => {
      const s = await window.electronAPI.getAllSettings();
      setSettings(s);
      try {
        const list = await window.electronAPI.backupList(s.autoBackupDir || undefined);
        setBackupFiles(list);
      } catch {
        // listing is best-effort
      }
    })();
  }, []);

  const refresh = async () => {
    const s = await window.electronAPI.getAllSettings();
    setSettings(s);
    try {
      const list = await window.electronAPI.backupList(s.autoBackupDir || undefined);
      setBackupFiles(list);
    } catch {
      // ignore
    }
  };

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.electronAPI.setSetting(key, value);
    await refresh();
  };

  const totalSize = useMemo(() => backupFiles.reduce((sum, f) => sum + f.size, 0), [backupFiles]);

  if (!settings) return <Spin />;

  const handleBackup = async () => {
    const dir = settings.autoBackupDir || (await window.electronAPI.openDirectory());
    if (!dir) return;
    if (!settings.autoBackupDir) await update("autoBackupDir", dir);
    setCreating(true);
    try {
      const result = await window.electronAPI.backupCreate(dir);
      message.success(`备份已创建：${result.filePath}`);
      await refresh();
    } catch (err) {
      message.error(`备份失败: ${formatError(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handlePickDir = async () => {
    setPickingDir(true);
    try {
      const dir = await window.electronAPI.openDirectory();
      if (dir) await update("autoBackupDir", dir);
    } finally {
      setPickingDir(false);
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
          message.error(`恢复失败: ${formatError(err)}`);
        } finally {
          setRestoring(false);
        }
      },
    });
  };

  const handleDeleteBackup = async (name: string) => {
    Modal.confirm({
      title: "删除此备份？",
      content: name,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await window.electronAPI.backupDelete(settings.autoBackupDir || undefined, name);
          message.success("已删除");
          await refresh();
        } catch (err) {
          message.error(`删除失败: ${formatError(err)}`);
        }
      },
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title="手动备份" style={{ maxWidth: 720 }}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Paragraph type="secondary">
            备份会将整个 SQLite 数据库（包含所有资料元数据、文本、分类与标签）打包为单个 zip 文件。文件原件不在备份中，请单独保留。
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

      <Card title="自动备份" style={{ maxWidth: 720 }}>
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="备份频率">
                <Select
                  value={settings.autoBackupCadence}
                  onChange={(v) => void update("autoBackupCadence", v)}
                  options={(["off", "daily", "weekly", "onQuit"] as Cadence[]).map((c) => ({
                    value: c,
                    label: CADENCE_LABEL[c],
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="保留份数">
                <InputNumber
                  min={1}
                  max={365}
                  value={settings.autoBackupKeep}
                  onChange={(v) => v != null && void update("autoBackupKeep", v)}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label={
              <Space>
                <span>备份目录</span>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: "normal" }}>
                  (留空则使用「文档/BidDocManagerBackups」)
                </Text>
              </Space>
            }
          >
            <Input
              value={settings.autoBackupDir}
              placeholder="默认目录"
              readOnly
              addonAfter={
                <Button
                  type="text"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  loading={pickingDir}
                  onClick={handlePickDir}
                >
                  选择
                </Button>
              }
            />
          </Form.Item>
          <Form.Item label="退出时也备份一份（覆盖频率设置）" style={{ marginBottom: 0 }}>
            <Switch
              checked={settings.autoBackupOnQuit}
              onChange={(v) => void update("autoBackupOnQuit", v)}
            />
            <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
              开启后，无论上面的频率如何，每次正常退出都会额外做一次备份。
            </Text>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="历史备份"
        style={{ maxWidth: 720 }}
        extra={
          <Space>
            <Statistic
              title="文件数"
              value={backupFiles.length}
              valueStyle={{ fontSize: 14 }}
            />
            <Statistic
              title="总大小"
              value={(totalSize / 1024 / 1024).toFixed(2)}
              suffix="MB"
              valueStyle={{ fontSize: 14 }}
            />
          </Space>
        }
      >
        {backupFiles.length === 0 ? (
          <Text type="secondary">该目录下暂无备份文件。</Text>
        ) : (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            {backupFiles.map((f) => (
              <Row key={f.name} gutter={8} align="middle" style={{ padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                <Col flex="auto">
                  <Text>{f.name}</Text>
                  <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                    {(f.size / 1024 / 1024).toFixed(2)} MB · {new Date(f.mtime).toLocaleString()}
                  </Text>
                </Col>
                <Col>
                  <Button size="small" danger onClick={() => handleDeleteBackup(f.name)}>
                    删除
                  </Button>
                </Col>
              </Row>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}
