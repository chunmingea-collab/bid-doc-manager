import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Popconfirm,
  message,
  Modal,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ExportOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  EyeOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import OcrCorrectionPanel from '../../components/OcrCorrectionPanel';

const { Title } = Typography;
const { Search } = Input;

interface DocumentRecord {
  id: string;
  fileName: string;
  extension: string;
  category: string;
  tags: string[];
  originalPath: string;
  size: number;
  expiryDate?: string;
  companyName?: string;
  importStatus: string;
  extractedText?: string;
  correctedText?: string;
}

const fileTypes = ['全部', 'PDF', 'WORD', 'EXCEL', 'IMAGE', 'OTHER'] as const;
type FileTypeFilter = (typeof fileTypes)[number];

function extensionToFileType(ext: string): FileTypeFilter {
  const e = ext.toLowerCase().replace('.', '');
  if (e === 'pdf') return 'PDF';
  if (['doc', 'docx'].includes(e)) return 'WORD';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'EXCEL';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff'].includes(e)) return 'IMAGE';
  return 'OTHER';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fileTypeColorMap: Record<string, string> = {
  PDF: '#f5222d',
  WORD: '#1677ff',
  EXCEL: '#52c41a',
  IMAGE: '#faad14',
  OTHER: '#8c8c8c',
};

const statusColorMap: Record<string, string> = {
  pending: 'default',
  completed: 'success',
  error: 'error',
};

const statusLabelMap: Record<string, string> = {
  pending: '待处理',
  completed: '已完成',
  error: '出错',
};

const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('全部');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrDoc, setOcrDoc] = useState<DocumentRecord | null>(null);

  // Debounce timer for search input
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Staged search text for debounced updates
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  // Refs to avoid stale closures in callbacks
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  const searchTextRef = useRef(searchText);
  const categoryFilterRef = useRef(categoryFilter);
  const typeFilterRef = useRef(typeFilter);

  // Keep refs in sync
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);
  useEffect(() => { searchTextRef.current = searchText; }, [searchText]);
  useEffect(() => { categoryFilterRef.current = categoryFilter; }, [categoryFilter]);
  useEffect(() => { typeFilterRef.current = typeFilter; }, [typeFilter]);

  // Load categories from DB via IPC
  const fetchCategories = useCallback(async () => {
    try {
      const cats = await window.electronAPI.getAllCategories();
      setCategoryOptions([
        { value: '', label: '全部分类' },
        ...cats.filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name })),
      ]);
    } catch {
      setCategoryOptions([
        { value: '', label: '全部分类' },
        { value: 'qualification', label: '企业资质' },
        { value: 'basics', label: '企业基础资料' },
        { value: 'personnel', label: '人员证书' },
        { value: 'performance', label: '项目业绩' },
        { value: 'finance', label: '财务资料' },
        { value: 'certification', label: '体系认证' },
        { value: 'intellectual', label: '专利与知识产权' },
        { value: 'other', label: '其他资料' },
      ]);
    }
  }, []);

  const fetchDocuments = useCallback(async (
    query?: string,
    category?: string,
    fileType?: string,
    p?: number,
    ps?: number,
  ) => {
    setLoading(true);
    try {
      const q = query ?? searchTextRef.current;
      const c = category ?? categoryFilterRef.current;
      const f = fileType ?? typeFilterRef.current;
      const pageNum = p ?? pageRef.current;
      const pageSz = ps ?? pageSizeRef.current;
      const filters: Record<string, unknown> = {};
      if (q) filters.query = q;
      if (c) filters.categoryIds = [c];
      if (f && f !== '全部') filters.fileType = f;
      const result = await window.electronAPI.searchDocuments(filters, pageNum, pageSz);
      const mapped: DocumentRecord[] = result.results.map((r) => {
        const f = r.file as Record<string, unknown>;
        const tags = (f.tags as Array<{ name: string }> | undefined)?.map((t) => t.name) ?? [];
        const cat = f.category as { name: string } | null | undefined;
        return {
          id: f.id as string,
          fileName: f.fileName as string,
          extension: f.extension as string,
          category: cat?.name ?? '未分类',
          tags,
          originalPath: f.originalPath as string,
          size: f.size as number,
          expiryDate: (f.expiryDate as string) || undefined,
          companyName: (f.companyName as string) || undefined,
          importStatus: (f.importStatus as string) || 'pending',
          extractedText: (f.extractedText as string) || '',
          correctedText: (f.correctedText as string) || undefined,
        };
      });
      setDocuments(mapped);
      setTotal(result.total);
    } catch {
      setDocuments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, debouncedSearchText, categoryFilter, typeFilter]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const handleSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchText(value);
    setDebouncedSearchText(value);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchText(value);
      setPage(1);
    }, 300);
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.deleteFile(id);
      message.success('已删除');
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id));
      fetchDocuments(searchText, categoryFilter, typeFilter);
    } catch {
      message.error('删除失败');
    }
  };

  const handleView = (record: DocumentRecord) => {
    window.electronAPI.openPath(record.originalPath);
  };

  const openOcrModal = (record: DocumentRecord) => {
    setOcrDoc(record);
    setOcrModalOpen(true);
  };

  const handleCorrectTextSave = async (fileId: string, correctedText: string) => {
    try {
      await window.electronAPI.correctText(fileId, correctedText);
      message.success('OCR 文字已保存');
      setOcrModalOpen(false);
      fetchDocuments(searchText, categoryFilter, typeFilter);
    } catch {
      message.error('保存失败');
    }
  };

  const handleExportExcel = async () => {
    const ids = selectedRowKeys.length > 0 ? selectedRowKeys : documents.map((d) => d.id);
    try {
      const result = await window.electronAPI.exportToExcel({ fileIds: ids });
      message.success(`已导出 ${result.count} 条记录到 ${result.filePath}`);
    } catch {
      message.error('导出失败');
    }
  };

  const handleExportZip = async () => {
    const ids = selectedRowKeys.length > 0 ? selectedRowKeys : documents.map((d) => d.id);
    try {
      const result = await window.electronAPI.exportDocuments({ fileIds: ids });
      message.success(`已导出 ${result.count} 个文件`);
    } catch {
      message.error('导出失败');
    }
  };

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: `批量删除 ${selectedRowKeys.length} 份资料？`,
      content: '资料将被移入回收站，30 天后自动清除。期间可在数据库中恢复。',
      okType: 'danger',
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          const results = await Promise.allSettled(
            selectedRowKeys.map((id) => window.electronAPI.deleteFile(id)),
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed > 0) {
            message.warning(`已删除 ${selectedRowKeys.length - failed} 份，${failed} 份删除失败`);
          } else {
            message.success(`已删除 ${selectedRowKeys.length} 份资料`);
          }
          setSelectedRowKeys([]);
          fetchDocuments(searchText, categoryFilter, typeFilter);
        } catch (err) {
          message.error(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  };

  const columns: ColumnsType<DocumentRecord> = [
    {
      title: '文件名称',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 250,
      render: (name: string, record) => (
        <span
          style={{ cursor: 'pointer', color: '#1677ff' }}
          onClick={() => handleView(record)}
        >
          {name}
        </span>
      ),
      sorter: (a, b) => a.fileName.localeCompare(b.fileName),
    },
    {
      title: '类型',
      dataIndex: 'extension',
      key: 'extension',
      width: 80,
      filters: fileTypes.slice(1).map((t) => ({ text: t, value: t })),
      onFilter: (value, record) => extensionToFileType(record.extension) === value,
      render: (ext: string) => {
        const type = extensionToFileType(ext);
        return <Tag color={fileTypeColorMap[type] || '#8c8c8c'}>{type}</Tag>;
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 140,
      render: (tags: string[]) => (
        <Space wrap size={4}>
          {tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {tags.length > 2 && <Tag>+{tags.length - 2}</Tag>}
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '有效期',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      width: 100,
      render: (date?: string) => {
        if (!date) return <span style={{ color: '#bfbfbf' }}>--</span>;
        const exp = new Date(date);
        const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysLeft < 90 ? (
          <Tag color={daysLeft < 0 ? 'error' : 'warning'}>{daysLeft < 0 ? '过期' : `${daysLeft}天`}</Tag>
        ) : (
          <Tag color="success">{date.slice(0, 10)}</Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'importStatus',
      key: 'importStatus',
      width: 80,
      render: (status: string) => (
        <Tag color={statusColorMap[status] ?? 'default'}>{statusLabelMap[status] ?? status}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: DocumentRecord) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openOcrModal(record)}
            disabled={!['IMAGE', 'PDF'].includes(extensionToFileType(record.extension))}
          >
            修正
          </Button>
          <Popconfirm
            title="确定要删除此文件吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>文档管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchDocuments(searchText, categoryFilter, typeFilter)}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportExcel} disabled={documents.length === 0}>
            导出清单
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExportZip} disabled={documents.length === 0}>
            导出文件
          </Button>
          <Button type="primary" icon={<FolderOpenOutlined />} onClick={() => navigate('/import')}>
            导入资料
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap align="center">
          <Search
            placeholder="搜索文件名或内容"
            allowClear
            style={{ width: 280 }}
            value={searchText}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            prefix={<SearchOutlined />}
          />
          <Select
            style={{ width: 160 }}
            value={categoryFilter}
            onChange={(val) => { setCategoryFilter(val); setPage(1); }}
            options={categoryOptions}
            allowClear
            placeholder="全部分类"
          />
          <Select<FileTypeFilter>
            style={{ width: 120 }}
            value={typeFilter}
            onChange={(val) => { setTypeFilter(val); setPage(1); }}
            options={fileTypes.map((t) => ({ value: t, label: t }))}
          />
          <span style={{ color: '#8c8c8c', marginLeft: 8 }}>
            共 {total} 条记录
          </span>
        </Space>
      </Card>

      {selectedRowKeys.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 16, background: '#e6f4ff', borderColor: '#91caff' }}
        >
          <Space>
            <span>已选择 <strong>{selectedRowKeys.length}</strong> 项</span>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExportExcel}>
              导出选中清单
            </Button>
            <Button size="small" icon={<ExportOutlined />} onClick={handleExportZip}>
              导出选中文件
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
              批量删除
            </Button>
          </Space>
        </Card>
      )}

      <Table<DocumentRecord>
        rowKey="id"
        columns={columns}
        dataSource={documents}
        loading={loading}
        scroll={{ x: 1000 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
            fetchDocuments();
          },
        }}
      />

      <Modal
        title="OCR 文字修正"
        open={ocrModalOpen}
        onCancel={() => setOcrModalOpen(false)}
        footer={null}
        width="80%"
        style={{ top: 24 }}
        destroyOnClose
      >
        {ocrDoc && (
          <OcrCorrectionPanel
            fileId={ocrDoc.id}
            filePath={ocrDoc.originalPath}
            fileType={extensionToFileType(ocrDoc.extension) === 'PDF' ? 'pdf' : 'image'}
            originalText={ocrDoc.correctedText || ocrDoc.extractedText || ''}
            onSave={handleCorrectTextSave}
            onClose={() => setOcrModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
};

export default DocumentsPage;