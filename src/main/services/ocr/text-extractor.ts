import * as fs from "fs-extra";
import * as mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as XLSX from "xlsx";
import { parseOffice } from "officeparser";

type ExtractResult = {
  text: string;
  error?: string;
};

function getFileType(filePath: string): "pdf" | "word" | "excel" | "ppt" | "unknown" {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  if (ext === "docx" || ext === "doc") return "word";
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (ext === "pdf") return "pdf";
  if (ext === "pptx" || ext === "ppt") return "ppt";
  return "unknown";
}

async function extractPdf(filePath: string): Promise<ExtractResult> {
  try {
    const data = await fs.readFile(filePath);
    const loadingTask = getDocument({ data: new Uint8Array(data) });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item): item is TextItem => "str" in item)
        .map((item) => item.str)
        .join("\n");
      pages.push(text);
    }

    // Destroy the PDF document to free memory
    try { await pdf.destroy(); } catch { /* ignore */ }

    return { text: pages.join("\n").trim() };
  } catch (err) {
    return { text: "", error: `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function extractWord(filePath: string): Promise<ExtractResult> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value.trim() };
  } catch (err) {
    return { text: "", error: `Word extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function extractExcel(filePath: string): Promise<ExtractResult> {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheets: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const data = XLSX.utils
        .sheet_to_json<Array<unknown>>(worksheet, { header: 1 })
        .filter(
          (row): row is Array<unknown> =>
            Array.isArray(row) &&
            row.some((cell) => cell !== null && cell !== undefined && cell !== "")
        )
        .map((row) =>
          row
            .map((cell) => (cell !== null && cell !== undefined ? String(cell) : ""))
            .join(" ")
        )
        .join("\n");

      if (data.trim()) {
        sheets.push(`--- Sheet: ${sheetName} ---\n${data.trim()}`);
      }
    }

    return { text: sheets.join("\n\n").trim() };
  } catch (err) {
    return { text: "", error: `Excel extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function extractPpt(filePath: string): Promise<ExtractResult> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ppt") && !lower.endsWith(".pptx")) {
    return {
      text: "",
      error: "暂不支持旧版 .ppt 格式，请转换为 .pptx 后重新导入",
    };
  }
  try {
    const ast = await parseOffice(filePath);
    const text = typeof ast?.toText === "function" ? ast.toText() : String(ast ?? "");
    return { text: text.trim() };
  } catch (err) {
    return { text: "", error: `PPTX extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Extracts text from PDF, Word (doc/docx), or Excel (xls/xlsx) files.
 */
export async function extractText(filePath: string): Promise<ExtractResult> {
  const type = getFileType(filePath);

  switch (type) {
    case "pdf":
      return extractPdf(filePath);
    case "word":
      return extractWord(filePath);
    case "excel":
      return extractExcel(filePath);
    case "ppt":
      return extractPpt(filePath);
    default:
      return { text: "", error: `Unsupported file type for: ${filePath}` };
  }
}
