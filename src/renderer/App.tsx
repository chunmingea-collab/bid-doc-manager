import { Layout, Menu, theme } from "antd";
import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ImportPage from "./pages/Import";
import DocumentsPage from "./pages/Documents";
import SettingsPage from "./pages/Settings";
import ErrorBoundary from "./components/ErrorBoundary";
import NotificationCenter from "./components/NotificationCenter";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: "/dashboard", label: "首页" },
  { key: "/import", label: "导入" },
  { key: "/documents", label: "资料管理" },
  { key: "/settings", label: "设置" },
];

function Sidebar(): React.ReactElement {
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState(location.pathname);

  useEffect(() => {
    setSelectedKey(location.pathname);
  }, [location]);

  const { token } = theme.useToken();

  return (
    <Sider
      width={200}
      style={{ background: token.colorBgContainer, borderRight: "1px solid #f0f0f0" }}
    >
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        style={{ borderRight: 0 }}
        onClick={({ key }) => {
          window.location.hash = key;
        }}
      />
    </Sider>
  );
}

function AppShell(): React.ReactElement {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  useGlobalShortcuts();

  useEffect(() => {
    const menuHandler = (_e: unknown, route: string) => {
      navigate(route);
    };
    const notifHandler = (_e: unknown, payload: { route: string }) => {
      navigate(payload.route);
    };
    const unsubMenu = window.electronAPI.onMenuNavigate(menuHandler);
    const unsubNotif = window.electronAPI.onNotificationOpen(notifHandler);
    return () => {
      unsubMenu();
      unsubNotif();
    };
  }, [navigate]);

  return (
    <Layout style={{ height: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: token.colorPrimary,
          padding: "0 24px",
        }}
      >
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>
          投标资料管理
        </span>
        <NotificationCenter />
      </Header>
      <Layout>
        <Sidebar />
        <Content style={{ padding: 24, background: token.colorBgLayout }}>
          <div
            style={{
              background: token.colorBgContainer,
              padding: 24,
              borderRadius: token.borderRadius,
              minHeight: 400,
            }}
          >
            <Routes>
              <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="/import" element={<ErrorBoundary><ImportPage /></ErrorBoundary>} />
              <Route path="/documents" element={<ErrorBoundary><DocumentsPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function App(): React.ReactElement {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

export default App;
