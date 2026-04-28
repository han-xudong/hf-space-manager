import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("hfSpaceManagerDesktop", {
  platform: process.platform,
});