# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: 投标企业资料管理工具 (Bid Document Manager)

Local-offline desktop application for managing bidding/procurement documents. Features folder import, local OCR, automatic classification, full-text search, and expiry reminders. **All data stays on-device — no cloud.**

## Current State

V1.0 polish pass complete. All P0/P1/P2 tasks done plus a release-readiness pass:

- **Core pipeline** (import → text extraction → OCR → classification → key info) wired end-to-end with concurrency cap 4 and per-file error isolation.
- **Search**: SQLite FTS5 virtual table `file_fts` populated via triggers. <1s on 10k+ files. Falls back to LIKE when FTS5 is unavailable.
- **OCR**: Calls a bundled `paddleocr_runner.exe` (PyInstaller-built, ships at `vendor/paddleocr/`) with the PP-OCRv4 models at `paddle-ocr-models/`. JSON contract. Self-test on app start. Run `scripts/build-paddleocr-runner.ps1` once to produce the runner.
- **Date handling**: All expiry dates normalized to ISO `YYYY-MM-DD` at write-time via `src/utils/date.ts`. Reminder buckets and dashboard counts read ISO.
- **PPT/PPTX**: Extracted via `officeparser`. Legacy `.ppt` rejected with a friendly conversion-required message.
- **ZIP import**: `.zip` archives are auto-extracted to `os.tmpdir()/bid-doc-zip-extracts/<sha8>/` and recursed.
- **Settings**: Tabbed Settings page (`src/renderer/pages/Settings/index.tsx`) with Categories / Reminders / Backup / OCR sub-pages. Preferences stored in `Setting(key, value)` table.
- **Reminders**: `scheduleReminderCheck` runs every 6h; native Electron `Notification` per bucket via `src/main/services/notification-service.ts`. Startup popup once per day.
- **Backup/restore**: Node-native via `archiver` (create) + `adm-zip` (extract). No PowerShell.
- **30-day trash purge**: `src/main/services/maintenance-service.ts` runs daily.
- **UX**: Top-level `ErrorBoundary`, in-app `NotificationCenter` (bell icon), bulk delete on Documents, native app menu, global keyboard shortcuts (`Ctrl+1..4`, `Ctrl+I`, `Ctrl+F`).
- **Production DB**: Prisma client points to `app.getPath('userData')/profiles/<active>/bid_doc_manager.db`. On first launch, `ensureUserDatabase()` copies a pre-migrated empty template from `<resources>/prisma/bid_doc_manager.db` and runs `seedCategories()`.
- **Multi-profile (multi-enterprise)**: Each customer company is a fully isolated workspace — own DB, own classification rules, own tags, own reminders, own backup. Switcher in the top bar. See `AGENTS.md` for the full layout.
- **Tests**: Vitest, 111 passing across 13 files. Run `pnpm test`.
- **Logging**: `electron-log` writes to `app.getPath('logs')/main.log`.
- **Packaging**: `scripts/after-pack.js` verifies the bundle has the DB template, OCR models, Prisma query engine, and (warns on) the OCR runner before NSIS installer creation.

## Build & Dev Commands

```
pnpm dev       # Start Vite dev server + Electron
pnpm build     # Production build
npx tsc --noEmit  # Type-check without emitting
npx prisma generate  # Regenerate Prisma client after schema changes
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 28+ |
| UI | React 18 + TypeScript + Ant Design 5 |
| Main process | Node.js 20+ |
| OCR | PaddleOCR 2.7+ (local, offline) |
| Text extraction | pdfjs-dist / mammoth.js / xlsx |
| Database | SQLite3 + Prisma ORM |
| File ops | fs-extra |
| State | Zustand |

## Planned Directory Structure

```
bid-doc-manager/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Entry point
│   │   ├── ipc/              # IPC handlers
│   │   └── services/         # Import, OCR, classification, search, notification
│   ├── preload/              # Context-isolated preload bridge
│   ├── renderer/             # React UI
│   │   ├── store/            # Zustand stores
│   │   ├── components/       # Shared UI components
│   │   ├── pages/            # Dashboard, Import, Documents, Settings
│   │   └── utils/            # Renderer-side helpers
│   └── utils/                # Shared utilities (date, contrast, prisma)
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── bid_doc_manager.db    # Seed template shipped in the installer
│   └── migrations/           # Versioned migration history
├── config/default-categories.ts  # Built-in classification rules
├── scripts/                  # Build & maintenance scripts
│   └── __tests__/            # Tests for build assets
├── e2e/                      # Playwright Electron e2e tests
├── build/                    # Icons, EULA, installer header (build assets)
└── electron-builder.yml      # Packager config
```

Tests are co-located with their source as `*.test.ts`. Build-level tests for
`electron-builder.yml` and `EULA.txt` live in `scripts/__tests__/`.

## Development Task Sequence (from PRD)

Tasks are prioritized P0 → P1 → P2. Each depends on the prior task:

| Priority | Task | Key files |
|----------|------|-----------|
| P0 | T1: Project scaffolding | package.json, tsconfig, electron builder |
| P0 | T2: Prisma schema (File, Category, Tag models) | prisma/schema.prisma |
| P0 | T3: Import service (folder scan, dedup via MD5) | src/main/services/import/ |
| P0 | T4: Import UI (drag-drop, progress) | src/renderer/pages/Import/ |
| P0 | T5: Text extraction (PDF/Word/Excel) | src/main/services/ocr/ |
| P0 | T6: PaddleOCR integration | src/main/services/ocr/ |
| P0 | T7: Auto-classification engine | src/main/services/classifier/ |
| P0 | T8: Document management UI | src/renderer/pages/Documents/ |
| P1 | T9-T14: Search, key info extraction, reminders, export | Multiple |
| P2 | T15-T18: Custom categories, OCR correction, backup, packaging | Multiple |

## Core Architecture Principles

1. **Offline-first** — Zero network calls by default. OCR models stored locally. No cloud APIs.
2. **Async everything** — All long-running operations (import, OCR, classification) run asynchronously in the main process. Progress communicated to the renderer via IPC events. Never block the UI thread.
3. **Concurrent limit** — Batch processing caps at 4 concurrent tasks to avoid CPU exhaustion.
4. **Error isolation** — Every operation has error handling. A single file failure (corrupt file, OCR failure) must not crash the entire import.

## Key Domain Concepts

- **Classification rules**: Hierarchical (category → subcategory). Matching priority: subcategory keywords first, then parent category, then "其他资料" fallback. Rules defined in `config/default-categories.ts`, user overrides stored in DB.
- **Key info fields extracted from text**: expiry date, certificate number, company name, person name, qualification level — all via regex/keyword matching.
- **File dedup**: MD5 hash comparison. Options: overwrite, keep both (rename), skip.

## PRD Location

Full product requirements: `投标企业资料管理工具PRD.md` (Chinese language)
