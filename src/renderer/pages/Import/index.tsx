import React, { useCallback, useEffect } from "react";
import {
  Button,
  Card,
  Progress,
  Space,
  Radio,
  Typography,
  Tag,
  List,
  Empty,
  Result,
  theme,
  Popconfirm,
  Alert,
  message,
} from "antd";
import {
  FolderOpenOutlined,
  InboxOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  PlayCircleFilled,
  StopOutlined,
} from "@ant-design/icons";
import { useImportStore } from "../../store/import-store";
import { formatError } from "../../utils/errors";

const { Text } = Typography;

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function ImportPage() {
  const { token } = theme.useToken();

  const phase = useImportStore((s) => s.phase);
  const scanResult = useImportStore((s) => s.scanResult);
  const progress = useImportStore((s) => s.progress);
  const result = useImportStore((s) => s.result);
  const duplicateAction = useImportStore((s) => s.duplicateAction);
  const isPaused = useImportStore((s) => s.isPaused);
  const isCancelling = useImportStore((s) => s.isCancelling);

  const setPhase = useImportStore((s) => s.setPhase);
  const setDuplicateAction = useImportStore((s) => s.setDuplicateAction);
  const startScan = useImportStore((s) => s.startScan);
  const startImport = useImportStore((s) => s.startImport);
  const pauseImport = useImportStore((s) => s.pauseImport);
  const resumeImport = useImportStore((s) => s.resumeImport);
  const cancelImport = useImportStore((s) => s.cancelImport);
  const reset = useImportStore((s) => s.reset);
  const hydrateFromSettings = useImportStore((s) => s.hydrateFromSettings);

  useEffect(() => {
    hydrateFromSettings();
  }, [hydrateFromSettings]);

  const isDisabled = phase === "scanning" || phase === "importing";

  const handleSelectFolder = useCallback(async () => {
    if (!window.electronAPI?.openDirectory || isDisabled) return;
    const dir = await window.electronAPI.openDirectory();
    if (dir) {
      try {
        await startScan(dir);
      } catch (err) {
        message.error(`扫描失败：${formatError(err)}`);
      }
    }
  }, [startScan, isDisabled]);

  const handleStartImport = useCallback(async () => {
    if (scanResult && scanResult.files.length > 0) {
      try {
        await startImport(scanResult.files);
      } catch (err) {
        message.error(`启动导入失败：${formatError(err)}`);
      }
    }
  }, [scanResult, startImport]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  if (phase === "idle" || phase === "scanning") {
    return (
      <div>
        <h2 style={{ marginBottom: 24 }}>导入资料</h2>

        <Card
          style={{
            background: token.colorBgLayout,
            marginBottom: 24,
            border: `2px dashed ${token.colorBorder}`,
            borderRadius: 8,
            textAlign: "center",
            padding: 48,
          }}
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <InboxOutlined style={{ fontSize: 48, color: token.colorPrimary }} />
            <div>
              <Text strong style={{ fontSize: 16 }}>将资料拖拽到此处，或点击选择文件夹</Text>
              <br />
              <Text type="secondary">支持 PDF、Word、Excel、图片格式</Text>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<FolderOpenOutlined />}
              loading={phase === "scanning"}
              disabled={isDisabled}
              onClick={handleSelectFolder}
            >
              {phase === "scanning" ? "正在扫描文件夹..." : "选择文件夹"}
            </Button>
          </Space>
        </Card>

        {phase === "scanning" && (
          <Progress
            percent={undefined}
            strokeColor={token.colorPrimary}
            style={{ marginTop: 16 }}
          />
        )}
      </div>
    );
  }

  if (phase === "reviewing" && scanResult) {
    return (
      <div>
        <h2 style={{ marginBottom: 24 }}>导入资料</h2>

        <Card style={{ marginBottom: 24, background: token.colorBgLayout }}>
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Space>
              <FileTextOutlined style={{ color: token.colorPrimary }} />
              <Text strong>
                扫描到 {scanResult.files.length} 个文件，共 {formatSize(scanResult.totalSize)}
              </Text>
            </Space>

            {scanResult.skippedCount > 0 && (
              <Text type="secondary">
                已跳过 {scanResult.skippedCount} 个不支持的文件
              </Text>
            )}

            <Space>
              <Text>重复文件处理：</Text>
              <Radio.Group
                value={duplicateAction}
                onChange={(e) => {
                  setDuplicateAction(e.target.value);
                  // Persist as the new default for next time.
                  window.electronAPI.setSetting("duplicateAction", e.target.value).catch(() => null);
                }}
              >
                <Radio.Button value="keep_both">保留两份</Radio.Button>
                <Radio.Button value="overwrite">覆盖</Radio.Button>
                <Radio.Button value="skip">跳过</Radio.Button>
              </Radio.Group>
            </Space>
          </Space>
        </Card>

        <List
          header={<Text type="secondary">文件列表（{scanResult.files.length}）</Text>}
          bordered
          size="small"
          dataSource={scanResult.files}
          rowKey={(f) => f.path + ":" + f.md5}
          style={{ marginBottom: 24 }}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Tag color="blue" key="ext">{file.extension.toUpperCase()}</Tag>,
                <Text type="secondary" key="size">{formatSize(file.size)}</Text>,
              ]}
            >
              <FileTextOutlined style={{ marginRight: 8, color: token.colorTextDisabled }} />
              <Text ellipsis style={{ maxWidth: 500 }}>{file.fileName}</Text>
            </List.Item>
          )}
        />

        <Space>
          <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={handleStartImport}>
            开始导入
          </Button>
          <Button onClick={() => setPhase("idle")}>重新选择</Button>
        </Space>
      </div>
    );
  }

  if (phase === "importing" && progress) {
    return (
      <div>
        <h2 style={{ marginBottom: 24 }}>导入资料</h2>

        <Card style={{ maxWidth: 600, margin: "0 auto" }}>
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            <Text strong>
              {isCancelling
                ? "正在取消..."
                : isPaused
                ? "已暂停"
                : "正在导入..."}
            </Text>

            <Progress
              percent={progress.percentage}
              status={
                progress.status === "failed"
                  ? "exception"
                  : isPaused
                  ? "normal"
                  : "active"
              }
              strokeColor={token.colorPrimary}
            />

            <Space direction="vertical" style={{ width: "100%" }}>
              <Text type="secondary">
                已处理 {progress.processedFiles} / {progress.totalFiles} 个文件
              </Text>
              {progress.currentFile && !isCancelling && (
                <Text type="secondary" ellipsis style={{ maxWidth: 500 }}>
                  当前: {progress.currentFile}
                </Text>
              )}
              {progress.errorCount > 0 && (
                <Text type="danger">{progress.errorCount} 个文件处理失败</Text>
              )}
            </Space>

            {isPaused && (
              <Alert
                type="info"
                showIcon
                message="已暂停：当前文件完成后将停止处理新文件。"
                style={{ width: "100%" }}
              />
            )}

            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              {isPaused ? (
                <Button
                  type="primary"
                  icon={<PlayCircleFilled />}
                  onClick={resumeImport}
                  disabled={isCancelling}
                >
                  继续
                </Button>
              ) : (
                <Button
                  icon={<PauseCircleOutlined />}
                  onClick={pauseImport}
                  disabled={isCancelling}
                >
                  暂停
                </Button>
              )}
              <Popconfirm
                title="确定取消本次导入？"
                description="已处理的进度会保留，但未处理的剩余文件将不会继续。"
                onConfirm={cancelImport}
                okText="取消导入"
                cancelText="继续导入"
                okButtonProps={{ danger: true }}
                disabled={isCancelling}
              >
                <Button danger icon={<StopOutlined />} disabled={isCancelling}>
                  取消导入
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div>
        <h2 style={{ marginBottom: 24 }}>导入资料</h2>

        <Result
          status={result.errorCount > 0 ? "warning" : "success"}
          title="导入完成"
          subTitle={
            <Space>
              <Text type="success">成功导入 {result.importedCount} 个文件</Text>
              {result.errorCount > 0 && (
                <Text type="danger">{result.errorCount} 个文件失败</Text>
              )}
            </Space>
          }
          extra={[
            <Button type="primary" key="again" icon={<FolderOpenOutlined />} onClick={handleReset}>
              继续导入
            </Button>,
            <Button key="back" onClick={handleReset}>返回首页</Button>,
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>导入资料</h2>
      <Empty description="暂无数据" />
      <Button onClick={handleReset}>返回</Button>
    </div>
  );
}
