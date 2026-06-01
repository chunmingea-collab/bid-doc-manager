import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Image, Input, Button, Space, Tag, Tooltip, message, Typography, Statistic } from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  DiffOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

export interface OcrCorrectionProps {
  fileId: string;
  filePath: string;
  fileType: 'image' | 'pdf';
  originalText: string;
  onSave?: (fileId: string, correctedText: string) => Promise<void>;
  onClose?: () => void;
}

interface DiffResult {
  original: string;
  modified: string;
  hasChanges: boolean;
  insertions: number;
  deletions: number;
}

function computeDiff(original: string, modified: string): DiffResult {
  const insertions = Math.max(0, modified.length - original.length);
  const deletions = Math.max(0, original.length - modified.length);
  return {
    original,
    modified,
    hasChanges: original !== modified,
    insertions,
    deletions,
  };
}

function RenderDiff({ original, modified }: { original: string; modified: string }) {
  const linesOrig = original.split('\n');
  const linesMod = modified.split('\n');
  const maxLen = Math.max(linesOrig.length, linesMod.length);

  return (
    <div style={{ fontSize: 14, lineHeight: 1.8 }}>
      {Array.from({ length: maxLen }, (_, i) => {
        const o = linesOrig[i];
        const m = linesMod[i];

        if (o === undefined) {
          return (
            <div key={i} style={{ backgroundColor: '#f6ffed', color: '#389e0d', padding: '0 8px', borderLeft: '3px solid #52c41a' }}>
              + {m}
            </div>
          );
        }
        if (m === undefined) {
          return (
            <div key={i} style={{ backgroundColor: '#fff2f0', color: '#cf1322', padding: '0 8px', borderLeft: '3px solid #ff4d4f' }}>
              - {o}
            </div>
          );
        }
        if (o !== m) {
          return (
            <div key={i}>
              <div style={{ backgroundColor: '#fff2f0', color: '#cf1322', padding: '0 8px', borderLeft: '3px solid #ff4d4f' }}>
                - {o}
              </div>
              <div style={{ backgroundColor: '#f6ffed', color: '#389e0d', padding: '0 8px', borderLeft: '3px solid #52c41a' }}>
                + {m}
              </div>
            </div>
          );
        }
        return (
          <div key={i} style={{ color: '#8c8c8c', padding: '0 8px', borderLeft: '3px solid #f0f0f0' }}>
            {o}
          </div>
        );
      })}
    </div>
  );
}

const OcrCorrectionPanel: React.FC<OcrCorrectionProps> = ({
  fileId,
  filePath,
  fileType,
  originalText,
  onSave,
  onClose,
}) => {
  // Sync editedText when originalText changes (e.g. switching between files)
  const [editedText, setEditedText] = useState(originalText);
  const [prevFileId, setPrevFileId] = useState(fileId);

  if (fileId !== prevFileId) {
    setPrevFileId(fileId);
    setEditedText(originalText);
  }

  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');
  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    if (filePath) {
      if (fileType === 'pdf') {
        setPreviewUrl(`${filePath}#toolbar=0&navpanes=0`);
      } else {
        setPreviewUrl(filePath);
      }
    }
  }, [filePath, fileType]);

  const diff = useMemo(() => computeDiff(originalText, editedText), [originalText, editedText]);

  const characterCount = editedText.length;
  const wordCount = editedText.trim() ? editedText.trim().split(/\s+/).length : 0;

  const handleSave = useCallback(async () => {
    if (!diff.hasChanges) {
      message.info('文字内容未发生变化');
      return;
    }
    setIsSaving(true);
    try {
      await onSave?.(fileId, editedText);
      message.success('修正已保存');
    } catch (err) {
      message.error(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [fileId, editedText, diff.hasChanges, onSave]);

  const handleDiscard = useCallback(() => {
    setEditedText(originalText);
    message.info('已恢复原始文字');
  }, [originalText]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedText(e.target.value);
  }, []);

  return (
    <div style={{ display: 'flex', height: 450, border: '1px solid #f0f0f0', borderRadius: 8 }}>
      {/* Left: Preview */}
      <div style={{ width: '50%', background: '#fafafa', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Title level={5} style={{ margin: 0 }}>文件预览</Title>
            <Tag color="blue">{fileType === 'pdf' ? 'PDF 文档' : '图片文件'}</Tag>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{filePath.split('/').pop()}</Text>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {fileType === 'pdf' ? (
            <iframe
              src={previewUrl}
              title="PDF Preview"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <Image
              src={previewUrl}
              alt="OCR Source"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            />
          )}
        </div>
      </div>

      {/* Right: Text */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Space style={{ marginBottom: 8 }} wrap>
            <Title level={5} style={{ margin: 0 }}>OCR 文字修正</Title>
            {diff.hasChanges && (
              <Tag color="orange">已修改 · +{diff.insertions} -{diff.deletions} 字符</Tag>
            )}
          </Space>
          <Space>
            <Tooltip title={viewMode === 'edit' ? '当前: 编辑模式' : '切换到编辑模式'}>
              <Button
                icon={<ColumnWidthOutlined />}
                onClick={() => setViewMode('edit')}
                type={viewMode === 'edit' ? 'primary' : 'default'}
                size="small"
              >
                编辑
              </Button>
            </Tooltip>
            <Tooltip title={viewMode === 'diff' ? '当前: 对比模式' : '切换到对比模式'}>
              <Button
                icon={<DiffOutlined />}
                onClick={() => setViewMode('diff')}
                type={viewMode === 'diff' ? 'primary' : 'default'}
                size="small"
                disabled={!diff.hasChanges}
              >
                对比
              </Button>
            </Tooltip>
            <Statistic value={characterCount} suffix="字" style={{ width: 100 }} valueStyle={{ fontSize: 13, color: '#8c8c8c' }} />
            <Statistic value={wordCount} suffix="词" style={{ width: 100 }} valueStyle={{ fontSize: 13, color: '#8c8c8c' }} />
          </Space>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {viewMode === 'edit' ? (
            <TextArea
              value={editedText}
              onChange={handleTextChange}
              placeholder="OCR 识别的文字将显示在这里..."
              autoSize={{ minRows: 10, maxRows: 50 }}
              style={{
                fontFamily: "'Noto Sans SC', 'Microsoft YaHei', monospace",
                fontSize: 14,
                lineHeight: 1.8,
                resize: 'none',
              }}
            />
          ) : (
            <RenderDiff original={diff.original} modified={diff.modified} />
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {diff.hasChanges && (
            <Button icon={<CloseOutlined />} onClick={handleDiscard}>恢复原文</Button>
          )}
          {onClose && <Button onClick={onClose}>取消</Button>}
          <Button
            type="primary"
            icon={isSaving ? undefined : <SaveOutlined />}
            onClick={handleSave}
            loading={isSaving}
            disabled={!diff.hasChanges}
          >
            保存修正
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OcrCorrectionPanel;
