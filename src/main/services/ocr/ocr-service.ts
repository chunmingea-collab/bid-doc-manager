import fse from "fs-extra";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface RecognizeResult {
  text: string;
  success: boolean;
  error?: string;
}

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp",
]);

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

interface RunnerPaths {
  runner: string | null;
  detModel: string | null;
  recModel: string | null;
}

let cachedPaths: RunnerPaths | null = null;

function resolveResourcesRoot(): string {
  const packed = (process as { resourcesPath?: string }).resourcesPath;
  if (packed && fse.existsSync(packed)) return packed;
  return process.cwd();
}

function resolveRunnerPaths(): RunnerPaths {
  if (cachedPaths) return cachedPaths;

  const root = resolveResourcesRoot();
  const explicit = process.env.PADDLEOCR_RUNNER;
  const candidates = [
    explicit,
    path.join(root, "vendor", "paddleocr", "paddleocr_runner.exe"),
    path.join(root, "vendor", "paddleocr", "paddleocr_runner"),
  ].filter((p): p is string => Boolean(p));

  const runner = candidates.find((p) => fse.existsSync(p)) ?? null;

  const modelsRoot = [
    path.join(root, "paddle-ocr-models"),
    path.join(process.cwd(), "paddle-ocr-models"),
  ].find((p) => fse.existsSync(p)) ?? null;

  const detModel = modelsRoot ? path.join(modelsRoot, "ch_PP-OCRv4_det_infer") : null;
  const recModel = modelsRoot ? path.join(modelsRoot, "ch_PP-OCRv4_rec_infer") : null;

  cachedPaths = {
    runner,
    detModel: detModel && fse.existsSync(detModel) ? detModel : null,
    recModel: recModel && fse.existsSync(recModel) ? recModel : null,
  };
  return cachedPaths;
}

export function invalidatePathCache(): void {
  cachedPaths = null;
}

interface RunnerResponse {
  ok: boolean;
  error?: string;
  lines?: { text: string; confidence: number }[];
  version?: string;
}

/** Find the last JSON object in stdout. */
function parseRunnerStdout(stdout: string): RunnerResponse | null {
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    // Find the first { and last } for partial-line JSON
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) continue;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as RunnerResponse;
    } catch {
      continue;
    }
  }
  return null;
}

export async function recognizeText(filePath: string): Promise<RecognizeResult> {
  if (!isImageFile(filePath)) {
    return {
      success: false,
      text: "",
      error: `不支持的文件类型。支持: ${[...IMAGE_EXTENSIONS].join(", ")}`,
    };
  }

  const { runner, detModel, recModel } = resolveRunnerPaths();
  if (!runner) {
    return {
      success: false,
      text: "",
      error: "OCR 引擎未配置：请在开发环境运行 scripts/build-paddleocr-runner.ps1，或重新安装应用",
    };
  }

  const args = ["--image", filePath, "--lang", "ch"];
  if (detModel) args.push("--det-model", detModel);
  if (recModel) args.push("--rec-model", recModel);

  try {
    const { stdout } = await execFileAsync(runner, args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      killSignal: "SIGTERM",
    });
    const parsed = parseRunnerStdout(stdout);
    if (!parsed) {
      return { success: false, text: "", error: "OCR 输出解析失败" };
    }
    if (!parsed.ok) {
      return { success: false, text: "", error: parsed.error ?? "OCR 失败" };
    }
    const lines = (parsed.lines ?? []).map((l) => l.text).filter(Boolean);
    return { success: true, text: lines.join("\n").trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, text: "", error: `PaddleOCR 执行失败: ${message}` };
  }
}

export interface OcrStatus {
  available: boolean;
  runnerPath: string | null;
  detModelPath: string | null;
  recModelPath: string | null;
  version?: string;
  error?: string;
}

let statusCache: { value: OcrStatus; at: number } | null = null;
const STATUS_TTL = 5 * 60 * 1000;

export async function getOcrStatus(force = false): Promise<OcrStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL) {
    return statusCache.value;
  }

  const { runner, detModel, recModel } = resolveRunnerPaths();
  const base: OcrStatus = {
    available: false,
    runnerPath: runner,
    detModelPath: detModel,
    recModelPath: recModel,
  };

  if (!runner) {
    base.error = "OCR 运行时未找到";
    statusCache = { value: base, at: Date.now() };
    return base;
  }

  try {
    const { stdout } = await execFileAsync(runner, ["--selftest"], {
      timeout: 30_000,
      windowsHide: true,
      killSignal: "SIGTERM",
    });
    const parsed = parseRunnerStdout(stdout);
    const value: OcrStatus = {
      ...base,
      available: parsed?.ok === true,
      version: parsed?.version,
      error: parsed?.ok ? undefined : parsed?.error ?? "self-test 未返回结果",
    };
    statusCache = { value, at: Date.now() };
    return value;
  } catch (err) {
    const value: OcrStatus = {
      ...base,
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
    statusCache = { value, at: Date.now() };
    return value;
  }
}

export async function isAvailable(): Promise<boolean> {
  return (await getOcrStatus()).available;
}
