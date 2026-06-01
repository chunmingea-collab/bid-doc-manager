import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  DeleteOutlined,
  ReloadOutlined,
  RollbackOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { RecycleBinItem } from "../../types/electron";
import { formatError } from "../../utils/errors";

const { Title, Text } = Typography;

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RecycleBinPage: React.FC = () => {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.listRecycleBin();
      setItems(data);
    } catch (err) {
      message.error("加载回收站失败：" + formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (id: string) => {
    try {
      await window.electronAPI.restoreFromRecycleBin(id);
      message.success("已恢复");
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id));
      load();
    } catch (err) {
      message.error("恢复失败：" + formatError(err));
    }
  };

  const handlePurge = async (id: string) => {
    try {
      await window.electronAPI.purgeFromRecycleBin(id);
      message.success("已永久删除");
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id));
      load();
    } catch (err) {
      message.error("删除失败：" + formatError(err));
    }
  };

  const handlePurgeAll = async () => {
    try {
      const r = await window.electronAPI.purgeAllFromRecycleBin();
      message.success(`已永久删除 ${r.purged} 个文件`);
      setSelectedRowKeys([]);
      load();
    } catch (err) {
      message.error("清空失败：" + formatError(err));
    }
  };

  const handleBatchRestore = async () => {
    const results = await Promise.allSettled(
      selectedRowKeys.map((k) => window.electronAPI.restoreFromRecycleBin(String(k))),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    const firstError = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    if (ok > 0) {
      message.success(
        failed > 0
          ? `已恢复 ${ok} 个文件，${failed} 个失败：${formatError(firstError?.reason)}`
          : `已恢复 ${ok} 个文件`,
      );
    } else {
      message.error(`恢复失败：${formatError(firstError?.reason)}`);
    }
    setSelectedRowKeys([]);
    load();
  };

  const columns: ColumnsType<RecycleBinItem> = [
    {
      title: "文件名",
      dataIndex: "fileName",
      key: "fileName",
      ellipsis: true,
    },
    {
      title: "类型",
      dataIndex: "extension",
      key: "extension",
      width: 90,
      render: (ext: string) => <Tag>{ext.toUpperCase()}</Tag>,
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: formatSize,
    },
    {
      title: "删除时间",
      dataIndex: "deletedAt",
      key: "deletedAt",
      width: 200,
      render: (iso: string) => {
        const days = daysSince(iso);
        return (
          <Space direction="vertical" size={0}>
            <span>{new Date(iso).toLocaleString("zh-CN")}</span>
            <Text type={days >= 25 ? "danger" : "secondary"} style={{ fontSize: 12 }}>
              {days === 0 ? "今天" : `${days} 天前`}
              {days >= 25 && "（即将自动清理）"}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={() => window.electronAPI.openPath(record.originalPath)}
          >
            查看原文件
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RollbackOutlined />}
            onClick={() => handleRestore(record.id)}
          >
            恢复
          </Button>
          <Popconfirm
            title="确定要永久删除此文件吗？此操作无法撤销。"
            onConfirm={() => handlePurge(record.id)}
            okText="永久删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              永久删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>回收站</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button
            icon={<RollbackOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchRestore}
          >
            批量恢复（{selectedRowKeys.length}）
          </Button>
          <Popconfirm
            title="确定要永久删除回收站中所有文件吗？此操作无法撤销。"
            onConfirm={handlePurgeAll}
            okText="清空"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={items.length === 0}
          >
            <Button danger icon={<DeleteOutlined />} disabled={items.length === 0}>
              清空回收站
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Card>
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          已删除的文件会保留 30 天，到期后由系统自动清理。在此期间你可以恢复它们。
        </Text>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 20 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="回收站是空的"
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default RecycleBinPage;
