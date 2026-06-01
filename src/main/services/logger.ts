import log from "electron-log/main";

// Configure once. File output goes to <userData>/logs/main.log.
log.transports.file.level = "info";
log.transports.console.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

log.initialize();

export const logger = log;

export type AppLogger = typeof log;
