import { contextBridge, ipcRenderer } from "electron";

const WINDOW_CONTROL_CHANNEL = "hfsm:window-control";
const WINDOW_STATE_CHANNEL = "hfsm:window-state";
const WINDOW_STATE_REQUEST_CHANNEL = "hfsm:get-window-state";

contextBridge.exposeInMainWorld("hfSpaceManagerDesktop", {
  platform: process.platform,
  minimize: () => ipcRenderer.send(WINDOW_CONTROL_CHANNEL, "minimize"),
  close: () => ipcRenderer.send(WINDOW_CONTROL_CHANNEL, "close"),
  getWindowState: () => ipcRenderer.invoke(WINDOW_STATE_REQUEST_CHANNEL),
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(WINDOW_STATE_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(WINDOW_STATE_CHANNEL, listener);
    };
  },
});