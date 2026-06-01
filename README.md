# 投标资料管理工具 (Bid Document Manager)

本地离线的投标/采购资料管理桌面应用。覆盖**文件夹导入 → 文本提取 → OCR → 自动分类 → 关键信息抽取 → 全文检索 → 到期提醒 → 备份/恢复**完整链路。所有数据保存在本机，不联网。

## 主要特性

- **文件夹一键导入** — 拖入或选择目录，自动跳过 `~$`、`.tmp`、`node_modules` 等垃圾；嵌套目录与 `.zip` 压缩包自动递归
- **本地 OCR** — 内置 PaddleOCR PP-OCRv4 中英文模型，无网络依赖
- **自动分类** — 内置 8 大类 27 个子类（资质、人员、业绩、财务…）的关键词规则，支持用户自定义
- **关键信息抽取** — 有效期、证书号、企业名、负责人、资质等级（正则 + 关键词）
- **FTS5 全文检索** — SQLite FTS5 虚表，10k+ 文件亚秒级
- **到期提醒** — 30/60/90 天 + 已过期四级桶，每日原生通知
- **30 天回收站** — 软删除 + 每日自动清理
- **完整备份恢复** — 一键打包 DB 还原
- **完全离线** — 零网络请求

## 系统要求

| 项目 | 版本 |
|------|------|
| Node.js | 20.x 或 22.x |
| pnpm | 10.x |
| Windows | 10+ (x64) |
| macOS | 11+ (x64 / arm64) |

## 开发

```bash
pnpm install            # 装依赖
pnpm prisma:generate    # 生成 Prisma client（已包含在 postinstall）
pnpm test               # 跑 40 个 Vitest 单测
pnpm dev                # 启动 Vite + Electron
```

可选：构建本地 OCR 引擎（PyInstaller 单文件）：

```bash
pwsh scripts/build-paddleocr-runner.ps1
```

## 打包

```bash
pnpm build              # 仅产出 dist/ + dist-electron/
pnpm build:win          # NSIS 安装包 (Windows x64)
pnpm build:mac          # DMG (macOS)
```

`after-pack.js` 会在打包前自动校验：
- ✅ Prisma query engine 二进制
- ✅ `prisma/bid_doc_manager.db` 模板
- ✅ PaddleOCR 模型目录
- ⚠️ `vendor/paddleocr/paddleocr_runner.exe`（OCR 引擎，未构建会警告但允许继续）

## 架构

```
src/
├── main/                # Electron 主进程
│   ├── index.ts         # 入口
│   ├── menu.ts          # 应用菜单
│   ├── ipc/             # IPC 处理器
│   └── services/        # 业务服务（导入、OCR、分类、搜索、提醒、备份…）
├── preload/             # 预加载（contextBridge）
├── renderer/            # React UI
│   ├── pages/           # Dashboard / Import / Documents / Settings
│   ├── components/      # ErrorBoundary / NotificationCenter / OcrCorrectionPanel
│   ├── store/           # Zustand stores
│   └── types/           # electron.d.ts（IPC 类型契约）
└── utils/               # date.ts、prisma.ts
config/
└── default-categories.ts   # 内置分类规则
prisma/
└── schema.prisma        # File / Category / Tag / Setting / ImportTask
```

## 关键设计

- **离线优先** — 默认零网络。OCR 模型打包在本地
- **异步一切** — 导入/OCR/分类都在主进程跑，通过 IPC 事件上报进度，UI 永不阻塞
- **并发上限 4** — 避免 CPU 拉满
- **错误隔离** — 单文件失败不拖垮整批
- **First-launch DB 模板** — `app.getPath('userData')/bid_doc_manager.db` 首次启动从 `<resources>/prisma/` 复制空模板，永不覆盖用户数据

## 数据存放

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\bid-doc-manager\` |
| macOS | `~/Library/Application Support/bid-doc-manager/` |
| Linux | `~/.config/bid-doc-manager/` |

包含：
- `bid_doc_manager.db` — SQLite 数据库
- `logs/main.log` — 运行日志（5MB × N 滚动）
- `Cache/`、`Local Storage/` — Chromium 内部

## License

MIT — 见 [LICENSE](./LICENSE)。
