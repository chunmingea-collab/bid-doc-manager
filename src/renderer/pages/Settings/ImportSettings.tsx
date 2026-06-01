import React, { useEffect, useState } from "react";
import { Card, Form, Radio, Space, Typography, message } from "antd";
import { ImportOutlined } from "@ant-design/icons";
import type { AppSettings } from "../../types/electron";
import { formatError } from "../../utils/errors";

const { Text } = Typography;

const ImportSettings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.electronAPI.getAllSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    try {
      await window.electronAPI.setSetting(key, value);
      setSettings({ ...settings, [key]: value });
    } catch (err) {
      message.error("保存失败：" + formatError(err));
    }
  };

  return (
    <Card
      title={
        <Space>
          <ImportOutlined />
          <span>导入设置</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Form layout="vertical">
        <Form.Item
          label="默认重复文件处理方式"
          extra="扫描到与已有资料 MD5 相同的文件时自动应用此策略。每次导入前可在导入页临时覆盖。"
        >
          <Radio.Group
            value={settings.duplicateAction}
            onChange={(e) => update("duplicateAction", e.target.value)}
          >
            <Radio.Button value="keep_both">保留两份</Radio.Button>
            <Radio.Button value="overwrite">覆盖旧文件</Radio.Button>
            <Radio.Button value="skip">跳过</Radio.Button>
          </Radio.Group>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {settings.duplicateAction === "keep_both" &&
                "导入时保留旧文件，新文件以新 ID 入库。"}
              {settings.duplicateAction === "overwrite" &&
                "用新文件覆盖旧文件，重新进行文本提取与分类。"}
              {settings.duplicateAction === "skip" &&
                "跳过与已有资料重复的文件，不导入。"}
            </Text>
          </div>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ImportSettings;
