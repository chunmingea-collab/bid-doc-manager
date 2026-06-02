import React, { useState } from "react";
import { Modal, Form, Input, ColorPicker, Button, Typography, Space } from "antd";
import { BankOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useProfileStore } from "../store/profile-store";
import { formatError } from "../utils/errors";
import { message } from "antd";

const { Title, Paragraph } = Typography;

interface Props {
  open: boolean;
  onCreated: (name: string) => void;
}

/**
 * First-launch wizard. Shown when no profile exists. Lets the user create
 * the first enterprise workspace; once created, the rest of the app
 * becomes available.
 */
export function OnboardingWizard({ open, onCreated }: Props): React.ReactElement {
  const create = useProfileStore((s) => s.create);
  const [form] = Form.useForm<{ name: string; taxId?: string; color: string; notes?: string }>();
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      maskClosable={false}
      width={520}
      centered
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space>
          <BankOutlined style={{ fontSize: 28, color: "var(--ant-color-primary)" }} />
          <Title level={3} style={{ margin: 0 }}>欢迎使用投标资料管理工具</Title>
        </Space>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          工具按 <b>企业档案</b> 隔离资料 — 投标专员帮多家企业投标时，切换企业即可拥有独立的工作区，
          资料、分类、标签、提醒都不会混在一起。
        </Paragraph>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          先创建你的第一家客户企业吧：
        </Paragraph>

        <Form
          form={form}
          layout="vertical"
          initialValues={{ color: "#1677ff" }}
          onFinish={async (values) => {
            setBusy(true);
            try {
              const color = typeof values.color === "string"
                ? values.color
                : (values.color as { toHexString?: () => string }).toHexString?.() ?? "#1677ff";
              const created = await create({
                name: values.name,
                taxId: values.taxId,
                color,
                notes: values.notes,
              });
              onCreated(created.name);
            } catch (err) {
              void message.error(formatError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="企业名称"
            rules={[
              { required: true, message: "请输入企业名称" },
              { max: 40, message: "不能超过 40 个字符" },
            ]}
          >
            <Input placeholder="如：北京建工集团股份有限公司" size="large" autoFocus />
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
            <Input.TextArea rows={2} maxLength={200} showCount placeholder="如：代理期限、客户介绍人..." />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={busy}
              icon={<ArrowRightOutlined />}
              iconPosition="end"
            >
              创建并开始
            </Button>
          </Form.Item>
        </Form>

        <Paragraph type="secondary" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
          之后可在右上角随时切换或新增其他企业档案
        </Paragraph>
      </Space>
    </Modal>
  );
}
