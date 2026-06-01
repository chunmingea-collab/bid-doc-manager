import React, { useEffect, useState } from "react";
import { Card, Button, Space, Typography, Spin, Tag, Alert, message } from "antd";
import type { OcrStatusDetail } from "../../types/electron";

const { Text, Paragraph } = Typography;

export default function OcrSettings(): React.ReactElement {
  const [status, setStatus] = useState<OcrStatusDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    setRefreshing(true);
    try {
      const s = await window.electronAPI.ocrStatusDetail(force);
      setStatus(s);
    } catch (err) {
      message.error(`检测失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  if (!status) return <Spin />;

  return (
    <Card
      title="OCR 引擎"
      style={{ maxWidth: 720 }}
      extra={
        <Button loading={refreshing} onClick={() => load(true)}>
          重新检测
        </Button>
      }
    >
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Text strong>状态：</Text>{" "}
          {status.available ? (
            <Tag color="success">可用{status.version ? ` · ${status.version}` : ""}</Tag>
          ) : (
            <Tag color="error">不可用</Tag>
          )}
        </div>

        {!status.available && status.error && (
          <Alert type="error" showIcon message="OCR 不可用" description={status.error} />
        )}

        <div>
          <Text strong>运行时路径：</Text>
          <Paragraph copyable={{ text: status.runnerPath ?? "" }} style={{ marginBottom: 0 }}>
            <code>{status.runnerPath ?? "未找到"}</code>
          </Paragraph>
        </div>

        <div>
          <Text strong>检测模型：</Text>
          <Paragraph style={{ marginBottom: 0 }}>
            <code>{status.detModelPath ?? "未找到"}</code>
          </Paragraph>
        </div>

        <div>
          <Text strong>识别模型：</Text>
          <Paragraph style={{ marginBottom: 0 }}>
            <code>{status.recModelPath ?? "未找到"}</code>
          </Paragraph>
        </div>

        {!status.available && (
          <Alert
            type="info"
            showIcon
            message="如需启用 OCR"
            description={
              <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
                <li>开发环境：在 PowerShell 中执行 <code>scripts\\build-paddleocr-runner.ps1</code> 一次性构建。</li>
                <li>用户安装包：重新安装应用，安装包会随附 <code>vendor/paddleocr/paddleocr_runner.exe</code>。</li>
                <li>或设置环境变量 <code>PADDLEOCR_RUNNER</code> 指向自定义可执行文件。</li>
              </ol>
            }
          />
        )}
      </Space>
    </Card>
  );
}
