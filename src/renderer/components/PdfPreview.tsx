import React, { useEffect, useRef, useState } from "react";
import { Spin, Alert, Button, Space, Typography } from "antd";
import { FileTextOutlined, FolderOpenOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import * as pdfjsLib from "pdfjs-dist";
// Vite turns this into a worker URL at build time.
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface PdfPreviewProps {
  filePath: string;
  fileName: string;
  /** Render at thumbnail size (first page only) or full viewer (paginated). */
  mode?: "thumbnail" | "full";
  height?: number;
  onOpenExternal?: () => void;
}

const MAX_THUMBNAIL_WIDTH = 220;
const MAX_FULL_WIDTH = 720;

function bytesToArrayBuffer(bytes: number[]): ArrayBuffer {
  const arr = new Uint8Array(bytes);
  return arr.buffer;
}

function bytesToBlobUrl(bytes: number[], mime: string): string {
  const arr = new Uint8Array(bytes);
  const blob = new Blob([arr], { type: mime });
  return URL.createObjectURL(blob);
}

export function PdfPreview({
  filePath,
  fileName: _fileName,
  mode = "full",
  height = 600,
  onOpenExternal,
}: PdfPreviewProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let doc: { destroy: () => void } | null = null;

    async function render(): Promise<void> {
      try {
        setLoading(true);
        setError(null);
        const { bytes, mime } = await window.electronAPI.readFileBytes(filePath);
        if (cancelled) return;
        if (!mime.includes("pdf")) {
          setError("不是 PDF 文件，无法用此组件预览。");
          return;
        }
        const ab = bytesToArrayBuffer(bytes);
        // Keep a Blob URL around in case we want to provide a fallback link.
        objectUrl = bytesToBlobUrl(bytes, mime);
        const loaded = await pdfjsLib.getDocument({ data: ab }).promise;
        doc = loaded;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setPageCount(loaded.numPages);
        const pageNum = mode === "thumbnail" ? 1 : Math.min(currentPage, loaded.numPages);
        const page = await loaded.getPage(pageNum);
        if (cancelled) {
          page.cleanup();
          loaded.destroy();
          return;
        }

        const maxW = mode === "thumbnail" ? MAX_THUMBNAIL_WIDTH : MAX_FULL_WIDTH;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = maxW / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (doc) {
        try {
          doc.destroy();
        } catch {
          // ignore — doc may already be destroyed
        }
      }
    };
  }, [filePath, currentPage, mode]);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="PDF 预览失败"
        description={error}
        action={
          onOpenExternal && (
            <Button size="small" icon={<FolderOpenOutlined />} onClick={onOpenExternal}>
              在文件夹中显示
            </Button>
          )
        }
      />
    );
  }

  return (
    <div style={{ position: "relative", minHeight: height, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <Spin tip="正在渲染 PDF..." />
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: loading ? "none" : "block",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          background: "#fff",
        }}
      />
      {!loading && mode === "full" && pageCount > 1 && (
        <Space style={{ marginTop: 12 }}>
          <Button
            icon={<LeftOutlined />}
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <Typography.Text>
            第 {currentPage} / {pageCount} 页
          </Typography.Text>
          <Button
            icon={<RightOutlined />}
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
          >
            下一页
          </Button>
          {onOpenExternal && (
            <Button icon={<FolderOpenOutlined />} onClick={onOpenExternal}>
              在文件夹中显示
            </Button>
          )}
        </Space>
      )}
      {!loading && mode === "thumbnail" && pageCount > 1 && (
        <Typography.Text type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
          <FileTextOutlined /> 共 {pageCount} 页（点击查看查看全文）
        </Typography.Text>
      )}
    </div>
  );
}

export default PdfPreview;
