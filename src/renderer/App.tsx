import { ConfigProvider, Layout, Menu, theme } from "antd";
import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ImportPage from "./pages/Import";
import DocumentsPage from "./pages/Documents";
import RecycleBinPage from "./pages/RecycleBin";
import SettingsPage from "./pages/Settings";
import { ProfileSettings } from "./pages/Settings/ProfileSettings";
import ErrorBoundary from "./components/ErrorBoundary";
import NotificationCenter from "./components/NotificationCenter";
import { ProfileSwitcher } from "./components/ProfileSwitcher";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useThemeMode } from "./hooks/useThemeMode";
import { useProfileStore } from "./store/profile-store";

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: "/dashboard", label: "首页" },
  { key: "/import", label: "导入" },
  { key: "/documents", label: "资料管理" },
  { key: "/recycle-bin", label: "回收站" },
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

  // Sync the OS theme preference to <body> so native scrollbars, the
  // Electron title bar overlay, and any non-Antd widgets follow along.
  const { resolved } = useThemeMode();
  useEffect(() => {
    document.body.dataset.theme = resolved;
  }, [resolved]);

  // When the active profile changes, the DB behind the singleton Prisma
  // client has flipped. Reload the renderer to drop all in-memory caches
  // and let every page re-fetch against the new profile.
  useEffect(() => {
    const handler = (_e: unknown, payload: { name: string | null }) => {
      if (payload.name === null) return; // wizard will take over
      window.location.hash = "/dashboard";
      // Defer reload one tick so the hash change is applied first.
      setTimeout(() => window.location.reload(), 50);
    };
    return window.electronAPI.onProfileChanged(handler);
  }, []);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ProfileSwitcher />
          <NotificationCenter />
        </div>
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
              <Route path="/recycle-bin" element={<ErrorBoundary><RecycleBinPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="/settings/profiles" element={<ErrorBoundary><ProfileSettings /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function WizardGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const active = useProfileStore((s) => s.active);
  const loaded = useProfileStore((s) => s.loaded);
  const refresh = useProfileStore((s) => s.refresh);
  const refreshActive = useProfileStore((s) => s.refreshActive);

  useEffect(() => {
    void refresh();
    void refreshActive();
  }, [refresh, refreshActive]);

  // While loading, render children (will likely 401 on DB calls — those
  // are caught and shown as empty states). Show the wizard only when we
  // have a confirmed empty profile list.
  if (!loaded) return <>{children}</>;
  if (profiles.length > 0) return <>{children}</>;

  return (
    <>
      {children}
      <OnboardingWizard
        open={active === null && loaded}
        onCreated={() => {
          // main process will emit profile:changed; the app will reload.
        }}
      />
    </>
  );
}

function App(): React.ReactElement {
  const { themeConfig } = useThemeMode();
  return (
    <ConfigProvider theme={themeConfig}>
      <HashRouter>
        <WizardGate>
          <AppShell />
        </WizardGate>
      </HashRouter>
    </ConfigProvider>
  );
}

export default App;
