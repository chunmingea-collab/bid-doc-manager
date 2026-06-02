import React, { useEffect, useState } from "react";
import { Dropdown, Button, Tag, Modal, Form, Input, ColorPicker, message, Tooltip, Space } from "antd";
import type { MenuProps } from "antd";
import { BankOutlined, PlusOutlined, EditOutlined, CaretDownOutlined, ExportOutlined } from "@ant-design/icons";
import { useProfileStore } from "../store/profile-store";
import { useNavigate } from "react-router-dom";
import { formatError } from "../utils/errors";

const SWITCH_DELAY_MS = 250;

type ProfileFormValues = {
  name: string;
  taxId?: string;
  color: string;
  notes?: string;
};

function colorToHex(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "toHexString" in c && typeof (c as { toHexString?: () => string }).toHexString === "function") {
    return (c as { toHexString: () => string }).toHexString();
  }
  return "#1677ff";
}

export function ProfileSwitcher(): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const active = useProfileStore((s) => s.active);
  const switchTo = useProfileStore((s) => s.switchTo);
  const refresh = useProfileStore((s) => s.refresh);
  const refreshActive = useProfileStore((s) => s.refreshActive);
  const exportOne = useProfileStore((s) => s.exportOne);
  const createProfile = useProfileStore((s) => s.create);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<ProfileFormValues>();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void refreshActive();
  }, [refresh, refreshActive]);

  if (!active) {
    return (
      <Button icon={<BankOutlined />} onClick={() => setCreateOpen(true)} type="primary">
        新建企业档案
      </Button>
    );
  }

  const items: MenuProps["items"] = [
    ...profiles.map((p) => ({
      key: p.name,
      label: (
        <Space>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 5,
              background: p.color,
            }}
          />
          <span style={{ fontWeight: p.name === active.name ? 600 : 400 }}>{p.name}</span>
          <Tag style={{ marginLeft: 4 }}>{p.fileCount} 份资料</Tag>
          {p.name === active.name ? <Tag color="blue">当前</Tag> : null}
        </Space>
      ),
      disabled: p.name === active.name || switchingTo !== null,
    })),
    { type: "divider" as const },
    {
      key: "__create",
      label: <><PlusOutlined /> 新建企业档案</>,
      disabled: switchingTo !== null,
    },
    {
      key: "__manage",
      label: <><EditOutlined /> 管理企业档案...</>,
      disabled: switchingTo !== null,
    },
    {
      key: "__export",
      label: <><ExportOutlined /> 导出当前企业...</>,
      disabled: switchingTo !== null,
    },
  ];

  const onMenuClick: MenuProps["onClick"] = async ({ key }) => {
    if (key === "__create") {
      setCreateOpen(true);
      return;
    }
    if (key === "__manage") {
      navigate("/settings/profiles");
      return;
    }
    if (key === "__export") {
      try {
        const res = await exportOne(active.name);
        if (res.canceled) return;
        void message.success(`已导出到 ${res.filePath}`);
      } catch (err) {
        void message.error(formatError(err));
      }
      return;
    }
    // Otherwise it's a profile name — switch
    setSwitchingTo(String(key));
    try {
      await switchTo(String(key));
      void message.success(`已切换到「${String(key)}」`);
    } catch (err) {
      void message.error(formatError(err));
    } finally {
      // Hold the loading flag briefly so the UI shows the in-flight switch
      setTimeout(() => setSwitchingTo(null), SWITCH_DELAY_MS);
    }
  };

  return (
    <>
      <Dropdown
        menu={{ items, onClick: onMenuClick, selectedKeys: active ? [active.name] : [] }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <Tooltip title="切换企业工作区">
          <Button type="text" style={{ height: 40, padding: "0 12px" }}>
            <Space>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: active.color,
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.06)",
                }}
              />
              <BankOutlined />
              <span style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                {active.name}
              </span>
              <CaretDownOutlined style={{ fontSize: 10 }} />
            </Space>
          </Button>
        </Tooltip>
      </Dropdown>
      <Modal
        title="新建企业档案"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        okText="创建并切换"
        cancelText="取消"
        destroyOnClose
        onOk={async () => {
          try {
            const values = await form.validateFields();
            const created = await createProfile({
              name: values.name,
              taxId: values.taxId,
              color: colorToHex(values.color),
              notes: values.notes,
            });
            setCreateOpen(false);
            form.resetFields();
            await switchTo(created.name);
          } catch (err) {
            if (err && typeof err === "object" && "errorFields" in err) return;
            void message.error(formatError(err));
          }
        }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ color: "#1677ff" }}
        >
          <Form.Item
            name="name"
            label="企业名称"
            rules={[
              { required: true, message: "请输入企业名称" },
              { max: 40, message: "不能超过 40 个字符" },
            ]}
          >
            <Input placeholder="如：北京建工集团股份有限公司" autoFocus />
          </Form.Item>
          <Form.Item name="taxId" label="统一社会信用代码（可选）">
            <Input placeholder="如：91110000123456789X" />
          </Form.Item>
          <Form.Item name="color" label="标识颜色">
            <ColorPicker
              format="hex"
              presets={[
                {
                  label: "推荐",
                  colors: [
                    "#1677ff", "#52c41a", "#722ed1", "#fa8c16",
                    "#13c2c2", "#eb2f96", "#fadb14", "#f5222d",
                  ],
                },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="备注（可选）">
            <Input.TextArea rows={2} maxLength={200} showCount placeholder="如：客户介绍人、代理期限、特殊要求..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
