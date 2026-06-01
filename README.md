# 投标资料管理工具 (Bid Document Manager)

[![CI](https://github.com/chunmingea-collab/bid-doc-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/chunmingea-collab/bid-doc-manager/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![Node](https://img.shields.io/badge/node-%3E%3D20%20%3C23-green)
![Offline](https://img.shields.io/badge/network-offline--first-success)

本地离线的投标 / 采购资料管理桌面应用。**所有数据保存在本机，零网络请求**。

覆盖 **文件夹导入 → 文本提取 → OCR → 自动分类 → 关键信息抽取 → 全文检索 → 到期提醒 → 备份/恢复** 完整链路。

---

## 目录

- [为什么做这个](#为什么做这个)
- [主要特性](#主要特性)
- [系统要求](#系统要求)
- [截图](#截图)
- [快速开始](#快速开始)
- [打包发布](#打包发布)
- [架构总览](#架构总览)
- [关键设计决策](#关键设计决策)
- [数据存放位置](#数据存放位置)
- [常见问题](#常见问题)
- [License](#license)

---

## 为什么做这个

投标企业每年要管理成百上千份资质、业绩、人员、财务等证明材料。常见痛点：

- 散落在员工电脑、邮件附件、U 盘里，**找不到**
- 资质证书有效期临近或过期，**错过投标窗口**
- 担心敏感商业数据上传云端，**不敢用 SaaS**
- 商务人员手工维护 Excel 索引表，**更新就乱**

这个工具一次性解决上述问题：把整盘资料拖进去，机器自动识别、分类、提取有效期、提醒续期。

---

## 主要特性

| 模块 | 能力 |
|------|------|
| **文件夹导入** | 拖入或选择目录，自动跳过 `~$` / `.tmp` / `node_modules` 等垃圾；嵌套目录与 `.zip` 压缩包自动递归 |
| **去重** | MD5 哈希比对；可选「覆盖」「并存重命名」「跳过」三种策略 |
| **文本提取** | PDF (pdfjs)、Word (mammoth)、Excel (xlsx) 原生文本层，零依赖 |
| **本地 OCR** | 内置 PaddleOCR 3.6 + PP-OCRv4 中英文模型，单文件 PyInstaller 打包，无网络调用 |
| **自动分类** | 内置 8 大类 27 个子类（资质 / 人员 / 业绩 / 财务…）的关键词规则，支持用户自定义 |
| **关键信息抽取** | 有效期、证书号、企业名、负责人、资质等级（正则 + 关键词 + 启发式） |
| **全文检索** | SQLite FTS5 虚表，10k+ 文件亚秒级返回 |
| **到期提醒** | 已过期 / 30 天 / 60 天 / 90 天四级桶，原生 Notification，跨进程可达 |
| **回收站** | 30 天软删除 + 每日自动清理，可恢复 |
| **备份恢复** | 一键打包 DB + 资源到 ZIP，可在新机器还原 |
| **多窗口隔离** | Electron `requestSingleInstanceLock` 防多开 |
| **完全离线** | 零网络请求；CI 流水线只读不外发 |

---

## 系统要求

| 项目 | 版本 |
|------|------|
| Node.js | 20.x 或 22.x（见 `.nvmrc`）|
| pnpm | 10.x |
| Windows | 10+ (x64) |
| macOS | 11+ (x64 / arm64) |
| 磁盘 | 安装后约 600 MB（OCR 引擎占大头）|

---

## 截图

> 运行 `pnpm dev` 后 UI 在 `http://localhost:5173` 渲染，主窗口由 Electron 拉起。

| Dashboard | 资料库 | 导入进度 |
|:---------:|:------:|:--------:|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Documents](docs/screenshots/documents.png) | ![Import](docs/screenshots/import.png) |

> 占位截图。运行 `pnpm dev` 后用截图工具替换 `docs/screenshots/*.png` 即可。

---

## 快速开始

```bash
git clone https://github.com/chunmingea-collab/bid-doc-manager.git
cd bid-doc-manager
pnpm install              # 装依赖
pnpm prisma:generate      # 生成 Prisma client（已包含在 postinstall）
pnpm test                 # 跑 40 个 Vitest 单测
pnpm dev                  # 启动 Vite + Electron
```

应用窗口弹出后，从左侧菜单选「导入」→ 拖一个目录进去，几分钟后「资料库」页就能看到全部文件被分类、提取了关键信息。

### 可选：构建本地 OCR 引擎

PyInstaller 打包 PaddleOCR 为单文件 .exe（235 MB），输出到 `vendor/paddleocr/paddleocr_runner.exe`。开发期可跳过，OCR 任务会自动降级到「只处理有文本层的 PDF」。

```bash
pwsh scripts/build-paddleocr-runner.ps1
```

需要 Python 3.11+ 与外网（首次装 paddlepaddle / paddleocr 约 1.5 GB）。

---

## 打包发布

```bash
pnpm build          # 仅产出 dist/ + dist-electron/（开发验证用）
pnpm build:win      # NSIS 安装包 (Windows x64)
pnpm build:mac      # DMG (macOS)
```

`scripts/after-pack.js` 在打包前自动校验：

- ✅ Prisma query engine 二进制
- ✅ `prisma/bid_doc_manager.db` 模板
- ✅ PaddleOCR 模型目录
- ⚠️ `vendor/paddleocr/paddleocr_runner.exe`（OCR 引擎，未构建会警告但允许继续）

构建产物落在 `release/` 目录。

---

## 架构总览

```
src/
├── main/                # Electron 主进程
│   ├── index.ts         # 入口（SingleInstanceLock + 全局异常）
│   ├── menu.ts          # 应用菜单（带跨进程导航）
│   ├── ipc/             # IPC 处理器
│   └── services/        # 业务服务（导入、OCR、分类、搜索、提醒、备份…）
├── preload/             # 预加载（contextBridge 暴露 window.api）
├── renderer/            # React 18 + Ant Design 5
│   ├── pages/           # Dashboard / Import / Documents / Settings
│   ├── components/      # ErrorBoundary / NotificationCenter / OcrCorrectionPanel
│   ├── store/           # Zustand stores
│   └── types/           # electron.d.ts（IPC 类型契约）
└── utils/               # date.ts、prisma.ts
config/
└── default-categories.ts   # 内置分类规则
prisma/
├── schema.prisma        # File / Category / Tag / Setting / ImportTask
└── migrations/          # 3 个 migration（含 FTS5 虚表）
vendor/
├── paddleocr/           # paddleocr_runner.exe（git 忽略）
└── paddle-ocr-models/   # PP-OCRv4 中英模型（git 忽略）
scripts/
├── after-pack.js                # electron-builder 钩子
├── build-paddleocr-runner.ps1   # OCR 引擎构建
└── download-paddle-models.js    # 模型下载
```

### 进程模型

```
┌─────────────────┐   IPC    ┌──────────────────┐
│   Renderer      │ ◀──────▶ │  Main Process    │
│  (React 18)     │          │  (Node.js 20)    │
│  Ant Design 5   │          │                  │
└─────────────────┘          │  • import        │
                             │  • ocr-service   │
                             │  • classifier    │
                             │  • search        │
                             │  • reminder      │
                             │  • backup        │
                             │                  │
                             │  Prisma ── SQLite│
                             └──────────────────┘
```

---

## 关键设计决策

- **离线优先** — 默认零网络。OCR 模型打包在本地；CI 不上传构建产物到第三方
- **异步一切** — 导入 / OCR / 分类都在主进程跑，通过 IPC 事件上报进度，UI 永不阻塞
- **并发上限 4** — `p-limit` 控制批处理任务并发数，避免 CPU 拉满
- **错误隔离** — 单文件失败不拖垮整批；坏文件只记入 `ImportTask.failedFiles`
- **First-launch DB 模板** — `app.getPath('userData')/bid_doc_manager.db` 首次启动从 `<resources>/prisma/` 复制空模板，永不覆盖用户数据
- **FTS5 增量同步** — `file_fts` 虚表通过 SQLite 触发器与 `file` 表双向同步；删除时 `isDeleted=1` 过滤
- **FTS5 触发器** — `file_fts_ai/ad/au` 触发器名与 `migrations/20260528000000_add_fts5` 对齐
- **提醒调度** — 用 `setTimeout` 链按用户设置的 `reminderHour`（默认 9 点）每日触发，替代硬编码 6 小时

---

## 数据存放位置

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\bid-doc-manager\` |
| macOS | `~/Library/Application Support/bid-doc-manager/` |
| Linux | `~/.config/bid-doc-manager/` |

包含：

- `bid_doc_manager.db` — SQLite 数据库（含文件元数据、分类、标签、关键信息、回收站）
- `logs/main.log` — 运行日志（5MB × N 滚动）
- `Cache/`、`Local Storage/` — Chromium 内部
- 用户导入的原始文件不复制——只记录路径，源文件移动后状态变为「原始文件丢失」

---

## 常见问题

**Q: OCR 引擎那么大，能不能不打包？**
A: 可以。`vendor/paddleocr/paddleocr_runner.exe` 缺失时，`after-pack.js` 只警告不阻塞。应用启动后会自动降级到「只处理有文本层的 PDF」。

**Q: 升级会清空我的数据吗？**
A: 不会。`bid_doc_manager.db` 在用户目录，与安装包分离。卸载 NSIS 时默认**不**删 userData。

**Q: 能跑在 Linux 吗？**
A: 代码层兼容，但 PaddleOCR .exe 是 Windows-only。要支持 Linux 需要分别打包 Linux .so。

**Q: 我的资料被上传到云了吗？**
A: 不会。整个应用零网络调用。可在 Wireshark 抓包验证。

---

## 配置 GitHub 仓库元信息

打开 https://github.com/chunmingea-collab/bid-doc-manager 页面右上角 ⚙ **Settings**：

- **Description**: `Local-offline desktop app for managing bidding & procurement documents. Folder import, OCR, auto-classify, full-text search, expiry reminders.`
- **Topics**（点击 ⚙ 旁的齿轮 → Add topic）: `electron` `typescript` `react` `paddleocr` `prisma` `sqlite` `document-management` `ocr` `offline-first` `chinese-nlp`
- **Include in the home page** 打勾: Releases, Packages, Environments
- **Social preview**: 1280×640 截图（可后续补）

---

## License

MIT — 见 [LICENSE](./LICENSE)。
