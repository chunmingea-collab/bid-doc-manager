import { Menu, BrowserWindow, shell } from "electron";

export function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "文件",
      submenu: [
        {
          label: "导入文件夹",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send("menu:navigate", "/import");
          },
        },
        {
          label: "备份与恢复",
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send("menu:navigate", "/settings?tab=backup");
          },
        },
        { type: "separator" },
        isMac ? { role: "close" as const } : { role: "quit" as const, label: "退出" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" as const, label: "撤销" },
        { role: "redo" as const, label: "重做" },
        { type: "separator" },
        { role: "cut" as const, label: "剪切" },
        { role: "copy" as const, label: "复制" },
        { role: "paste" as const, label: "粘贴" },
        { role: "selectAll" as const, label: "全选" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" as const, label: "重新加载" },
        ...(process.env.NODE_ENV === "development"
          ? [{ role: "toggleDevTools" as const, label: "开发者工具" }]
          : []),
        { type: "separator" },
        { role: "resetZoom" as const, label: "重置缩放" },
        { role: "zoomIn" as const, label: "放大" },
        { role: "zoomOut" as const, label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen" as const, label: "全屏" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于",
          click: () => {
            const { version } = require("../../package.json");
            const { dialog } = require("electron");
            dialog.showMessageBox({
              type: "info",
              title: "关于 投标资料管理工具",
              message: `投标资料管理工具 v${version}`,
              detail: [
                "本地离线智能投标资料管家",
                "",
                "OCR 引擎：PaddleOCR PP-OCRv4",
                "数据库：SQLite + Prisma",
                "界面：Electron + React + Ant Design",
              ].join("\n"),
              buttons: ["确定"],
            });
          },
        },
        {
          label: "在 GitHub 上反馈问题",
          click: () => shell.openExternal("https://github.com"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
