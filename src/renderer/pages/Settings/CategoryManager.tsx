import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Alert,
  List,
  ColorPicker,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UndoOutlined,
  FolderOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";
import type { DataNode } from "antd/es/tree";
import { useCategoryStore, type CategoryRuleWithColor } from "../../store/category-store";

const { Title } = Typography;

function buildTree(categories: CategoryRuleWithColor[]): DataNode[] {
  const map = new Map<string, DataNode[]>();

  for (const cat of categories) {
    const node: DataNode = {
      title: (
        <Space>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: cat.color || "#1677ff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
            }}
          />
          <FolderOutlined style={{ color: cat.color || "#1677ff" }} />
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

const CategoryDetail: React.FC<{
  category: CategoryRuleWithColor;
  onUpdateKeywords: (keywords: string[]) => void;
  onRename: (name: string) => void;
  onColorChange: (color: string) => void;
}> = ({ category, onUpdateKeywords, onRename, onColorChange }) => {
  const [newKeyword, setNewKeyword] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name);
  const [preview, setPreview] = useState<
    | { loading: boolean; totalFiles: number; matchedCount: number; sample: Array<{ id: string; fileName: string }> }
    | null
  >(null);
  const previewSeq = useRef(0);

  // Re-sync when the selected category changes (e.g. user picks another row).
  useEffect(() => {
    setNameDraft(category.name);
    setNewKeyword("");
    setPreview(null);
    // category.name is intentionally omitted — we only want to re-sync when
    // the user picks a different category, not when they edit this one's name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  const addKeyword = () => {
    const v = newKeyword.trim().toLowerCase();
    if (!v) return;
    if (category.keywords.includes(v)) {
      message.warning(`关键词「${v}」已存在`);
      return;
    }
    onUpdateKeywords([...category.keywords, v]);
    setNewKeyword("");
  };

  const removeKeyword = (kw: string) => {
    onUpdateKeywords(category.keywords.filter((k) => k !== kw));
  };

  const runPreview = async () => {
    const seq = ++previewSeq.current;
    setPreview({ loading: true, totalFiles: 0, matchedCount: 0, sample: [] });
    try {
      const r = await window.electronAPI.previewCategoryMatch(category.id);
      if (seq !== previewSeq.current) return; // stale
      setPreview({
        loading: false,
        totalFiles: r.totalFiles,
        matchedCount: r.matchedCount,
        sample: r.sample,
      });
    } catch (err) {
      if (seq !== previewSeq.current) return;
      setPreview(null);
      message.error(`测试失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const commitName = () => {
    const v = nameDraft.trim();
    if (!v) {
      message.warning("分类名称不能为空");
      return;
    }
    if (v === category.name) {
      setEditingName(false);
      return;
    }
    onRename(v);
    setEditingName(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {editingName ? (
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onPressEnter={commitName}
            onBlur={commitName}
            autoFocus
            style={{ maxWidth: 280 }}
            disabled={!category.isCustom}
          />
        ) : (
          <Title
            level={5}
            style={{ margin: 0, cursor: category.isCustom ? "text" : "default" }}
            onClick={() => category.isCustom && setEditingName(true)}
            title={category.isCustom ? "点击修改名称" : undefined}
          >
            {category.name}
          </Title>
        )}
        <Tag color={category.isCustom ? "orange" : "blue"}>
          {category.isCustom ? "自定义分类" : "内置分类"}
        </Tag>
      </div>
      <p>
        <span style={{ color: "#8c8c8c" }}>ID: {category.id}</span>
        {category.parentId && (
          <span style={{ color: "#8c8c8c", marginLeft: 12 }}>
            上级分类 ID: {category.parentId}
          </span>
        )}
        <span style={{ marginLeft: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#8c8c8c" }}>分类色标：</span>
          <ColorPicker
            value={category.color}
            onChange={(c) => onColorChange(c.toHexString())}
            size="small"
            showText
            disabledAlpha
            presets={[
              {
                label: "推荐色",
                colors: [
                  "#1677ff", "#722ed1", "#52c41a", "#fa8c16",
                  "#13c2c2", "#eb2f96", "#fadb14", "#bfbfbf",
                ],
              },
            ]}
          />
        </span>
      </p>

      <div style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Typography.Text strong>关键词 ({category.keywords.length})</Typography.Text>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={runPreview}
            disabled={category.keywords.length === 0 || preview?.loading}
          >
            测试匹配
          </Button>
        </div>
        <Input.Search
          placeholder="输入关键词后按回车添加"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onSearch={addKeyword}
          enterButton={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          disabled={!category.isCustom && false}
        />
        {category.keywords.length > 0 ? (
          <Space wrap>
            {category.keywords.map((kw) => (
              <Tag
                key={kw}
                closable
                closeIcon={<CloseOutlined />}
                onClose={(e) => {
                  e.preventDefault();
                  removeKeyword(kw);
                }}
                style={{ padding: "4px 8px", fontSize: 13 }}
              >
                {kw}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">暂无关键词</Typography.Text>
        )}
        {!category.isCustom && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="内置分类：可以编辑关键词，但重置后会还原。"
          />
        )}
      </div>

      {preview && (
        <div style={{ marginTop: 24 }}>
          <Typography.Text strong>匹配测试结果</Typography.Text>
          <Alert
            type={preview.matchedCount > 0 ? "success" : "info"}
            showIcon
            style={{ marginTop: 8 }}
            message={
              preview.loading
                ? "正在统计..."
                : `当前关键词会匹配 ${preview.matchedCount} / ${preview.totalFiles} 份资料（最多抽样 5000 份做匹配检测）`
            }
          />
          {!preview.loading && preview.sample.length > 0 && (
            <List
              size="small"
              style={{ marginTop: 12 }}
              header={<Typography.Text type="secondary">样本（前 {preview.sample.length} 条）</Typography.Text>}
              bordered
              dataSource={preview.sample}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text ellipsis style={{ maxWidth: "100%" }}>
                    {item.fileName}
                  </Typography.Text>
                </List.Item>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
};

const CategoryManager: React.FC = () => {
  const {
    categories,
    initialize,
    addCategory,
    updateCategory,
    deleteCategory,
    resetToDefaults,
    reorderCategories,
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
    (cat: CategoryRuleWithColor) => {
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
        color: "#1677ff",
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

  // Top-level categories, ordered by sortOrder. Reorder is only allowed on
  // top-level rows so that the tree shape (parent → children) stays
  // consistent. Children are sorted lexicographically inside buildTree.
  const topLevel = useMemo(
    () => categories.filter((c) => c.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const moveCategory = (id: string, direction: -1 | 1) => {
    const ids = topLevel.map((c) => c.id);
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    const newOrder = [...ids];
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
    void reorderCategories(newOrder);
  };

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
          <>
            <Tree
              showLine
              treeData={treeData}
              selectedKeys={selectedId ? [selectedId] : []}
              onSelect={(keys) => setSelectedId(keys.length > 0 ? (keys[0] as string) : null)}
              defaultExpandAll
            />
            {selectedCategory && selectedCategory.parentId === null && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={topLevel.findIndex((c) => c.id === selectedCategory.id) === 0}
                  onClick={() => moveCategory(selectedCategory.id, -1)}
                >
                  上移
                </Button>
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={
                    topLevel.findIndex((c) => c.id === selectedCategory.id) ===
                    topLevel.length - 1
                  }
                  onClick={() => moveCategory(selectedCategory.id, 1)}
                >
                  下移
                </Button>
                <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: "28px" }}>
                  仅顶级分类可重排
                </Typography.Text>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#bfbfbf", padding: 24, textAlign: "center" }}>
            暂无分类数据
          </div>
        )}
      </Card>

      {/* Right: Detail panel */}
      <Card title="分类详情" style={{ flex: 1 }}>
        {selectedCategory ? (
          <CategoryDetail
            category={selectedCategory}
            onUpdateKeywords={(keywords) => {
              updateCategory(selectedCategory.id, { keywords });
            }}
            onRename={(name) => {
              updateCategory(selectedCategory.id, { name });
            }}
            onColorChange={(color) => {
              updateCategory(selectedCategory.id, { color });
            }}
          />
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
