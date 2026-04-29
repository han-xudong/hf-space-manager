"use client";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DesktopWindowState = {
  isFullScreen: boolean;
};

const defaultWindowState: DesktopWindowState = {
  isFullScreen: false,
};

const routeLabels = [
  ["/dashboard", "workspace dashboard"],
  ["/connections", "connection vault"],
  ["/settings", "runtime settings"],
  ["/spaces/", "tracked space"],
] as const;

export function ElectronChrome() {
  const pathname = usePathname();
  const [platform] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.hfSpaceManagerDesktop?.platform ?? null;
  });
  const [windowState, setWindowState] = useState<DesktopWindowState>(defaultWindowState);

  useEffect(() => {
    const desktop = window.hfSpaceManagerDesktop;

    if (!desktop) {
      return;
    }

    void desktop.getWindowState().then((state) => {
      setWindowState(state);
    });

    return desktop.onWindowStateChange((state) => {
      setWindowState(state);
    });
  }, []);

  const sectionLabel = useMemo(() => {
    for (const [prefix, label] of routeLabels) {
      if (pathname === prefix || pathname.startsWith(prefix)) {
        return label;
      }
    }

    return "space operations console";
  }, [pathname]);

  if (!platform) {
    return null;
  }

  const isMac = platform === "darwin";

  return (
    <div className="electron-chrome" data-platform={platform}>
      <div className="electron-chrome-bar">
        <div className="electron-chrome-brand electron-no-drag">
          <div className="electron-chrome-copy">
            <p>HF SPACE MANAGER</p>
            <span>{sectionLabel}</span>
          </div>
        </div>

        <div className="electron-chrome-meta electron-no-drag">
          <span className="electron-chrome-chip">desktop/{platform}</span>
          {windowState.isFullScreen ? <span className="electron-chrome-chip">fullscreen</span> : null}
        </div>

        {isMac ? null : (
          <div className="electron-window-controls electron-no-drag" data-platform={platform} aria-label="Window controls">
            <button
              type="button"
              className="electron-window-button is-minimize"
              aria-label="Minimize window"
              title="Minimize"
              onClick={() => window.hfSpaceManagerDesktop?.minimize()}
            >
              <span aria-hidden="true">-</span>
            </button>
            <button
              type="button"
              className="electron-window-button is-danger"
              aria-label="Close window"
              title="Close"
              onClick={() => window.hfSpaceManagerDesktop?.close()}
            >
              <span aria-hidden="true">x</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}