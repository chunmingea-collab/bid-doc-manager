# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project: 投标企业资料管理工具 (Bid Document Manager)

Local-offline desktop application for managing bidding/procurement documents. Features folder import, local OCR, automatic classification, full-text search, and expiry reminders. **All data stays on-device — no cloud.**

## Current State

V1.0 complete. All P0/P1/P2 tasks done. See `CLAUDE.md` for the release-readiness summary.

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
│   ├── renderer/             # React UI
│   │   ├── store/            # Zustand stores
│   │   ├── components/       # Shared UI components
│   │   └── pages/            # Dashboard, Import, Documents, Settings
│   └── utils/                # Shared utilities
├── prisma/schema.prisma      # Database schema
├── config/default-categories.ts  # Built-in classification rules
└── public/                   # Static assets
```

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
