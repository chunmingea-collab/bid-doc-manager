import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ROUTES = ["/dashboard", "/import", "/documents", "/settings"];

/**
 * Global keyboard shortcuts:
 *   Ctrl+1..4  → navigate to the four pages
 *   Ctrl+I     → Import
 *   Ctrl+F     → focus the search box (dispatches a custom event)
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 4) {
        e.preventDefault();
        navigate(ROUTES[digit - 1]);
        return;
      }

      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        navigate("/import");
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("global:focusSearch"));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
