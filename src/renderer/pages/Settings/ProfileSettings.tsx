import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  ColorPicker,
  Popconfirm,
  Tag,
  App as AntApp,
  Typography,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  ExportOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { useProfileStore } from "../../store/profile-store";
import { formatError } from "../../utils/errors";
import type { ProfileMeta } from "../../types/electron";

const { Paragraph } = Typography;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export function ProfileSettings(): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const active = useProfileStore((s) => s.active);
  const refresh = useProfileStore((s) => s.refresh);
  const switchTo = useProfileStore((s) => s.switchTo);
  const create = useProfileStore((s) => s.create);
  const rename = useProfileStore((s) => s.rename);
  const updateMeta = useProfileStore((s) => s.updateMeta);
  const remove = useProfileStore((s) => s.remove);
  const exportOne = useProfileStore((s) => s.exportOne);
  const { message } = AntApp.useApp();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileMeta | null>(null);
  const [createForm] = Form.useForm<{ name: string; taxId?: string; color: string; notes?: string }>();
  const [editForm] = Form.useForm<{ name: string; taxId?: string; color: string; notes?: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Card
      title={
        <Space>
          <BankOutlined />
          <span>企业档案</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建企业档案
        </Button>
      }
    >
      <Paragraph type="secondary">
        每个企业档案拥有独立的资料、分类、标签和提醒。顶栏的切换器可在企业之间无缝切换。
      </Paragraph>

      <Table<ProfileMeta>
        rowKey="id"
        dataSource={profiles}
        pagination={false}
        columns={[
          {
            title: "企业",
            dataIndex: "name",
            key: "name",
            render: (name: string, row) => (
              <Space>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: row.color,
                  }}
                />
                <b>{name}</b>
                {active?.id === row.id ? <Tag color="blue">当前</Tag> : null}
              </Space>
            ),
          },
          {
            title: "统一社会信用代码",
            dataIndex: "taxId",
            key: "taxId",
            render: (v?: string) => v || <span style={{ color: "rgba(0,0,0,0.25)" }}>—</span>,
            width: 200,
          },
          {
            title: "资料数",
            dataIndex: "fileCount",
            key: "fileCount",
            width: 100,
            render: (n: number) => `${n} 份`,
          },
          {
            title: "占用空间",
            dataIndex: "sizeBytes",
            key: "sizeBytes",
            width: 120,
            render: formatBytes,
          },
          {
            title: "创建时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 170,
            render: formatDate,
          },
          {
            title: "操作",
            key: "actions",
            width: 280,
            render: (_v, row) => (
              <Space>
                {active?.id !== row.id ? (
                  <Tooltip title="切换到此工作区">
                    <Button
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={async () => {
                        try {
                          await switchTo(row.name);
                          void message.success(`已切换到「${row.name}」`);
                        } catch (err) {
                          void message.error(formatError(err));
                        }
                      }}
                    >
                      切换
                    </Button>
                  </Tooltip>
                ) : null}
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(row);
                    editForm.setFieldsValue({
                      name: row.name,
                      taxId: row.taxId ?? "",
                      color: row.color,
                      notes: row.notes ?? "",
                    });
                  }}
                >
                  编辑
                </Button>
                <Button
                  size="small"
                  icon={<ExportOutlined />}
                  onClick={async () => {
                    try {
                      const res = await exportOne(row.name);
                      if (res.canceled) return;
                      void message.success(`已导出到 ${res.filePath}`);
                    } catch (err) {
                      void message.error(formatError(err));
                    }
                  }}
                >
                  导出
                </Button>
                <Popconfirm
                  title={`删除「${row.name}」？`}
                  description={
                    active?.id === row.id
                      ? "当前正在使用的工作区无法删除，请先切换到其他企业"
                      : "档案将进入回收站，30 天后自动清除"
                  }
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true, disabled: active?.id === row.id }}
                  onConfirm={async () => {
                    try {
                      await remove(row.name);
                      void message.success("已移入回收站");
                    } catch (err) {
                      void message.error(formatError(err));
                    }
                  }}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={active?.id === row.id}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* Create modal */}
      <Modal
        title="新建企业档案"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={busy}
        onOk={async () => {
          try {
            const v = await createForm.validateFields();
            const color = typeof v.color === "string"
              ? v.color
              : (v.color as { toHexString?: () => string }).toHexString?.() ?? "#1677ff";
            await create({ name: v.name, taxId: v.taxId, color, notes: v.notes });
            setCreateOpen(false);
            createForm.resetFields();
            void message.success("已创建企业档案");
          } catch (err) {
            if (err && typeof err === "object" && "errorFields" in err) return;
            void message.error(formatError(err));
          }
        }}
      >
        <Form form={createForm} layout="vertical" initialValues={{ color: "#1677ff" }}>
          <Form.Item name="name" label="企业名称" rules={[{ required: true, max: 40 }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="taxId" label="统一社会信用代码（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="color" label="标识颜色">
            <ColorPicker format="hex" />
          </Form.Item>
          <Form.Item name="notes" label="备注（可选）">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title="编辑企业档案"
        open={editing !== null}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onOk={async () => {
          if (!editing) return;
          setBusy(true);
          try {
            const v = await editForm.validateFields();
            const color = typeof v.color === "string"
              ? v.color
              : (v.color as { toHexString?: () => string }).toHexString?.() ?? "#1677ff";
            if (v.name !== editing.name) {
              await rename(editing.name, v.name);
            }
            await updateMeta({ name: v.name, taxId: v.taxId, color, notes: v.notes });
            setEditing(null);
            void message.success("已保存");
          } catch (err) {
            if (err && typeof err === "object" && "errorFields" in err) return;
            void message.error(formatError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="企业名称" rules={[{ required: true, max: 40 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="taxId" label="统一社会信用代码（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="color" label="标识颜色">
            <ColorPicker format="hex" />
          </Form.Item>
          <Form.Item name="notes" label="备注（可选）">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
