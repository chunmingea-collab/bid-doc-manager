import { useEffect, useState, useCallback } from "react";
import { theme as antdTheme, type ThemeConfig } from "antd";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "bid-doc.themeMode";

function getSystemMode(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

/**
 * Resolves the user's theme preference (light / dark / system) and returns
 * a complete Antd ThemeConfig. Watches the OS preference so the app follows
 * the system when the user hasn't picked an explicit mode.
 */
export function useThemeMode(): {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  themeConfig: ThemeConfig;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [systemMode, setSystemMode] = useState<"light" | "dark">(() => getSystemMode());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemMode(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // localStorage may be disabled; the choice still works in-memory
    }
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? systemMode : mode;
  const themeConfig: ThemeConfig = {
    algorithm: resolved === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      // Subtle roundness tweak so cards feel a bit more modern.
      borderRadius: 6,
    },
  };

  return { mode, resolved, setMode, themeConfig };
}
