import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { ensureUserDatabase, ensureFts5 } from "./services/db-migrate";
import { prisma } from "../utils/prisma";
import { registerIpcHandlers } from "./ipc/handlers";
import { seedCategories } from "./services/seed-service";
import { scheduleMaintenance } from "./services/maintenance-service";
import { getOcrStatus } from "./services/ocr";
import {
  startNotificationSchedule,
  stopNotificationSchedule,
  maybeShowStartupReminder,
} from "./services/notification-service";
import { buildMenu } from "./menu";
import { logger } from "./services/logger";

let mainWindow: BrowserWindow | null = null;
let maintenanceHandle: { stop: () => void } | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/index.js");
}

function getRendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return path.join(__dirname, "../../dist/index.html");
}

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1280, screenWidth),
    height: Math.min(800, screenHeight),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  registerIpcHandlers();

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(getRendererUrl());
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Ensure only a single instance of the app runs at a time. Two instances
// racing on the same userData SQLite file is a recipe for corruption and
// a confusing "data disappeared after I opened the app" UX.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Last-resort safety nets. We never want a stray rejection to bring the
  // process down silently; log it and let the app keep running.
  process.on("uncaughtException", (err) => {
    logger.error("[main] uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("[main] unhandledRejection:", reason);
  });

  app.whenReady().then(async () => {
    logger.info("[app] ready");

    // Must be set before any Notification is created
    if (process.platform === "win32") {
      app.setAppUserModelId("com.biddate.manager");
    }

    try {
      await ensureUserDatabase();
      await ensureFts5();
    } catch (err) {
      logger.error("[app] failed to ensure user database:", err);
    }
    await seedCategories();
    maintenanceHandle = scheduleMaintenance();
    buildMenu();
    // Fire-and-forget OCR self-test so the result is cached before the UI asks
    getOcrStatus(true).catch((err) => {
      logger.warn("[ocr] self-test failed:", err);
    });
    startNotificationSchedule().catch((err) => {
      logger.error("[notification] failed to start schedule:", err);
    });
    createWindow();

    // Show the once-per-day startup reminder after the window is ready
    if (mainWindow) {
      mainWindow.webContents.once("did-finish-load", () => {
        maybeShowStartupReminder()
          .then((item) => {
            if (item) mainWindow?.webContents.send("notification:startup", item);
          })
          .catch((err) => logger.warn("[notification] startup reminder failed:", err));
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // Cleanup on quit — must wait for async disconnect
  app.on("before-quit", (event) => {
    event.preventDefault();
    maintenanceHandle?.stop();
    stopNotificationSchedule();
    prisma.$disconnect()
      .then(() => {
        app.quit();
      })
      .catch((err) => {
        logger.error("[app] prisma disconnect failed during quit:", err);
        app.quit();
      });
  });
}