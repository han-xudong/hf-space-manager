type DesktopWindowState = {
  isFullScreen: boolean;
};

type HfSpaceManagerDesktopBridge = {
  platform: NodeJS.Platform;
  minimize: () => void;
  close: () => void;
  getWindowState: () => Promise<DesktopWindowState>;
  onWindowStateChange: (callback: (state: DesktopWindowState) => void) => () => void;
};

declare global {
  interface Window {
    hfSpaceManagerDesktop?: HfSpaceManagerDesktopBridge;
  }
}

export {};