import React from "react";
import { Card, Form, Radio, Space, Typography } from "antd";
import { BgColorsOutlined } from "@ant-design/icons";
import { useThemeMode, type ThemeMode } from "../../hooks/useThemeMode";

const { Text } = Typography;

const ThemeSettings: React.FC = () => {
  const { mode, setMode } = useThemeMode();

  return (
    <Card
      title={
        <Space>
          <BgColorsOutlined />
          <span>外观</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Form layout="vertical">
        <Form.Item
          label="主题模式"
          extra="选择「跟随系统」时，应用会随操作系统的明暗设置自动切换。"
        >
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value as ThemeMode)}
          >
            <Radio.Button value="light">浅色</Radio.Button>
            <Radio.Button value="dark">深色</Radio.Button>
            <Radio.Button value="system">跟随系统</Radio.Button>
          </Radio.Group>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === "light" && "始终使用浅色界面。"}
              {mode === "dark" && "始终使用深色界面，适合长时间使用。"}
              {mode === "system" && "跟随操作系统设置自动切换。"}
            </Text>
          </div>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ThemeSettings;
