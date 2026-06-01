import React from "react";
import { Tabs } from "antd";
import CategoryManager from "./CategoryManager";
import ReminderSettings from "./ReminderSettings";
import BackupSettings from "./BackupSettings";
import OcrSettings from "./OcrSettings";
import ImportSettings from "./ImportSettings";
import ThemeSettings from "./ThemeSettings";

export default function SettingsPage(): React.ReactElement {
  return (
    <Tabs
      defaultActiveKey="categories"
      items={[
        { key: "categories", label: "分类管理", children: <CategoryManager /> },
        { key: "reminders", label: "到期提醒", children: <ReminderSettings /> },
        { key: "import", label: "导入", children: <ImportSettings /> },
        { key: "backup", label: "备份与恢复", children: <BackupSettings /> },
        { key: "ocr", label: "OCR 引擎", children: <OcrSettings /> },
        { key: "appearance", label: "外观", children: <ThemeSettings /> },
      ]}
    />
  );
}
