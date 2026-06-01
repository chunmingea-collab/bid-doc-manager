import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tree,
  Typography,
  Tag,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UndoOutlined,
  FolderOutlined,
} from "@ant-design/icons";
import type { DataNode } from "antd/es/tree";
import { useCategoryStore } from "../../store/category-store";
import type { CategoryRule } from "../../../../config/default-categories";

const { Title } = Typography;

function buildTree(categories: CategoryRule[]): DataNode[] {
  const map = new Map<string, DataNode[]>();

  for (const cat of categories) {
    const node: DataNode = {
      title: (
        <Space>
          <FolderOutlined />
          <span>{cat.name}</span>
          <Tag color={cat.isCustom ? "orange" : "blue"} style={{ fontSize: 11 }}>
            {cat.isCustom ? "自定义" : "内置"}
          </Tag>
          {cat.keywords.length > 0 && (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              ({cat.keywords.length} 个关键词)
            </span>
          )}
        </Space>
      ),
      key: cat.id,
    };
    const siblings = map.get(cat.parentId ?? "__root__") ?? [];
    siblings.push(node);
    map.set(cat.parentId ?? "__root__", siblings);
  }

  function walk(parentId: string): DataNode[] {
    const children = map.get(parentId);
    if (!children) return [];
    return children.map((node) => {
      const kids = walk(node.key as string);
      return kids.length ? { ...node, children: kids } : node;
    });
  }

  return walk("__root__");
}

const CategoryManager: React.FC = () => {
  const {
    categories,
    initialize,
    addCategory,
    updateCategory,
    deleteCategory,
    resetToDefaults,
  } = useCategoryStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [form] = Form.useForm();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;

  const parentOptions = [
    { value: null as unknown as string, label: "（顶级分类）" },
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];

  const openAddModal = useCallback(
    (parentId: string | null = null) => {
      setModalMode("add");
      form.resetFields();
      form.setFieldsValue({ parentId, keywords: [] });
      setModalOpen(true);
    },
    [form],
  );

  const openEditModal = useCallback(
    (cat: CategoryRule) => {
      setModalMode("edit");
      form.setFieldsValue({
        id: cat.id,
        name: cat.name,
        parentId: cat.parentId as unknown as string,
        keywords: cat.keywords,
      });
      setSelectedId(cat.id);
      setModalOpen(true);
    },
    [form],
  );

  const handleSubmit = useCallback(async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    if (modalMode === "add") {
      const id = `custom_${Date.now()}`;
      const parentId =
        values.parentId === null || values.parentId === undefined
          ? null
          : (values.parentId as string);
      addCategory({
        id,
        name: values.name,
        parentId,
        keywords: values.keywords ?? [],
        isCustom: true,
      });
      message.success("分类已添加");
    } else {
      const { id } = form.getFieldValue("id");
      updateCategory(id, {
        name: values.name,
        parentId: (values.parentId as string | null) ?? null,
        keywords: values.keywords ?? [],
      });
      message.success("分类已更新");
    }
    setModalOpen(false);
  }, [modalMode, form, addCategory, updateCategory]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    deleteCategory(selectedId);
    setSelectedId(null);
    message.success("分类已删除");
  }, [selectedId, deleteCategory]);

  const handleReset = useCallback(() => {
    Modal.confirm({
      title: "确认重置",
      content:
        "将所有分类恢复到默认值。您自定义的分类将被删除，修改过的内置分类关键词也将被还原。确定继续？",
      okText: "确认重置",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        resetToDefaults();
        setSelectedId(null);
        message.success("已恢复到默认分类");
      },
    });
  }, [resetToDefaults]);

  const treeData = useMemo(() => buildTree(categories), [categories]);

  return (
    <div style={{ display: "flex", gap: 24, height: "100%" }}>
      {/* Left: Tree panel */}
      <Card
        title="分类列表"
        style={{ width: 360, flexShrink: 0 }}
        extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} onClick={() => openAddModal(null)}>
              添加
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!selectedCategory}
              onClick={() => selectedCategory && openEditModal(selectedCategory)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除此分类及其所有子分类？"
              disabled={!selectedCategory}
              onConfirm={handleDelete}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedCategory}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
        styles={{ body: { padding: 8 } }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button size="small" icon={<UndoOutlined />} onClick={handleReset}>
            恢复默认
          </Button>
        </div>
        {treeData.length > 0 ? (
          <Tree
            showLine
            treeData={treeData}
            selectedKeys={selectedId ? [selectedId] : []}
            onSelect={(keys) => setSelectedId(keys.length > 0 ? (keys[0] as string) : null)}
            defaultExpandAll
          />
        ) : (
          <div style={{ color: "#bfbfbf", padding: 24, textAlign: "center" }}>
            暂无分类数据
          </div>
        )}
      </Card>

      {/* Right: Detail panel */}
      <Card title="分类详情" style={{ flex: 1 }}>
        {selectedCategory ? (
          <div>
            <Title level={5}>{selectedCategory.name}</Title>
            <p>
              <Tag color={selectedCategory.isCustom ? "orange" : "blue"}>
                {selectedCategory.isCustom ? "自定义分类" : "内置分类"}
              </Tag>
              <span style={{ color: "#8c8c8c" }}>ID: {selectedCategory.id}</span>
            </p>
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <Typography.Text strong>
                  关键词 ({selectedCategory.keywords.length})
                </Typography.Text>
              </div>
              {selectedCategory.keywords.length > 0 ? (
                <Space wrap>
                  {selectedCategory.keywords.map((kw) => (
                    <Tag key={kw}>{kw}</Tag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无关键词</Typography.Text>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: "#bfbfbf", textAlign: "center", padding: 48 }}>
            <FolderOutlined style={{ fontSize: 48, marginBottom: 16, display: "block" }} />
            请在左侧选择一个分类查看详情
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        title={modalMode === "add" ? "添加分类" : "编辑分类"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={modalMode === "add" ? "添加" : "保存"}
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {modalMode === "edit" && (
            <Form.Item name="id" hidden>
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: "请输入分类名称" }]}
          >
            <Input placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item
            name="parentId"
            label="上级分类"
          >
            <Select
              placeholder="请选择上级分类"
              options={parentOptions}
              allowClear={false}
            />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <Select
              mode="tags"
              placeholder="输入关键词后按回车添加"
              tokenSeparators={[","]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CategoryManager;
