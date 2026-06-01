# Screenshots

This directory holds PNG screenshots used in the top-level `README.md`.

The application is an Electron + React app, so screenshots must be captured
from a real running window (not headless). To populate this folder:

1. Run `pnpm dev` and wait for the Electron window to open.
2. Navigate to each page and capture a 1280x800 PNG:
   - `dashboard.png`    - Dashboard (overview cards, charts, recent files)
   - `documents.png`    - Documents (file list, filters, search box)
   - `import.png`       - Import (drag-drop zone, progress)
   - `settings.png`     - Settings (category rules, backup, reminder config)
3. Replace the placeholder files in this folder.
4. Commit. The README badges will resolve automatically.

Keep file size under 500 KB per image — use PNG-8 or WebP if larger.
