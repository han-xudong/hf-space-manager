import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu } from "electron";

import { ensureRuntimeDatabaseReady } from "../scripts/runtime-db.mjs";
import { waitForHealth } from "../scripts/runtime-env.mjs";
import { buildElectronRuntime } from "./runtime.mjs";

const preloadPath = fileURLToPath(new URL("./preload.mjs", import.meta.url));
const smokeTest = process.env.ELECTRON_SMOKE_TEST === "1";
const isMac = process.platform === "darwin";
const WINDOW_CONTROL_CHANNEL = "hfsm:window-control";
const WINDOW_STATE_CHANNEL = "hfsm:window-state";
const WINDOW_STATE_REQUEST_CHANNEL = "hfsm:get-window-state";
const trayIconPath = fileURLToPath(new URL("../build/icons/trayTemplate.png", import.meta.url));
const trayIcon2xPath = fileURLToPath(new URL("../build/icons/trayTemplate@2x.png", import.meta.url));

let mainWindow = null;
let tray = null;
let runtime = null;
let isShuttingDown = false;
const children = [];

function isMainWindowVisible() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
}

function getWindowState(window) {
  return {
    isFullScreen: window.isFullScreen(),
  };
}

function emitWindowState(window) {
  if (window.isDestroyed()) {
    return;
  }

  window.webContents.send(WINDOW_STATE_CHANNEL, getWindowState(window));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
  syncStatusMenus();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.hide();
  syncStatusMenus();
}

function navigateTo(pathname) {
  if (!mainWindow || !runtime || mainWindow.isDestroyed()) {
    return;
  }

  void mainWindow.loadURL(`${runtime.baseUrl}${pathname}`);
  showMainWindow();
}

function buildStatusMenu() {
  const isVisible = isMainWindowVisible();

  return Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => navigateTo("/dashboard"),
    },
    {
      label: "Connections",
      click: () => navigateTo("/connections"),
    },
    {
      label: "Settings",
      click: () => navigateTo("/settings"),
    },
    { type: "separator" },
    {
      label: isVisible ? "Hide Window" : "Show Window",
      click: () => {
        if (isMainWindowVisible()) {
          hideMainWindow();
          return;
        }

        showMainWindow();
      },
    },
    {
      label: "Quit HF Space Manager",
      click: () => app.quit(),
    },
  ]);
}

function syncStatusMenus() {
  if (!isMac) {
    return;
  }

  const menu = buildStatusMenu();

  tray?.setContextMenu(menu);

  if (app.dock) {
    app.dock.setMenu(menu);
  }
}

function createTray() {
  if (!isMac || tray) {
    return;
  }

  const trayIcon = nativeImage.createFromPath(trayIconPath);
  const trayIcon2x = nativeImage.createFromPath(trayIcon2xPath);

  if (!trayIcon.isEmpty() && !trayIcon2x.isEmpty()) {
    trayIcon.addRepresentation({
      scaleFactor: 2,
      width: trayIcon2x.getSize().width,
      height: trayIcon2x.getSize().height,
      buffer: trayIcon2x.toPNG(),
    });
  }

  trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  tray.setToolTip("HF Space Manager");
  syncStatusMenus();
  tray.on("click", () => {
    showMainWindow();
  });
  tray.on("right-click", () => {
    tray?.popUpContextMenu(buildStatusMenu());
  });

  log("status bar tray is ready");
}

function installApplicationMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: "Quit HF Space Manager",
          accelerator: "Command+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Workspace",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "Command+1",
          click: () => navigateTo("/dashboard"),
        },
        {
          label: "Connections",
          accelerator: "Command+2",
          click: () => navigateTo("/connections"),
        },
        {
          label: "Settings",
          accelerator: "Command+,",
          click: () => navigateTo("/settings"),
        },
        { type: "separator" },
        {
          label: "Refresh View",
          accelerator: "Command+R",
          click: () => mainWindow?.webContents.reload(),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

function log(message) {
  process.stdout.write(`[electron] ${message}\n`);
}

function spawnRuntimeProcess(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: runtime.appRoot,
    env: {
      ...runtime.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  const entry = { name, child };
  children.push(entry);

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const description = signal ? `${name} exited via ${signal}` : `${name} exited with code ${code ?? 0}`;
    log(description);
    app.quit();
  });

  return entry;
}

function terminateChild(entry, signal = "SIGTERM") {
  const { child } = entry;

  if (child.exitCode !== null || child.killed) {
    return;
  }

  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch {
    child.kill(signal);
  }
}

function shutdownChildren() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const entry of children) {
    terminateChild(entry, "SIGTERM");
  }

  const forceKillTimer = setTimeout(() => {
    for (const entry of children) {
      terminateChild(entry, "SIGKILL");
    }
  }, 5_000);

  forceKillTimer.unref();
}

async function startRuntime() {
  runtime = buildElectronRuntime({ userDataRoot: app.getPath("userData") });

  log("ensuring local database schema and bootstrap state");
  await ensureRuntimeDatabaseReady({ appRoot: runtime.appRoot, env: runtime.env });

  log(`starting local web runtime on ${runtime.baseUrl}`);
  spawnRuntimeProcess("web", [runtime.webEntry]);
  await waitForHealth(runtime.baseUrl);

  log("web runtime is healthy; starting worker runtime");
  const vendoredTsxLoader = path.join(runtime.runtimeVendorRoot, "node_modules", "tsx", "dist", "loader.mjs");
  const workerArgs = runtime.hasVendoredTsx
    ? ["--import", vendoredTsxLoader, runtime.workerEntry]
    : ["--import", "tsx", runtime.workerEntry];

  spawnRuntimeProcess("worker", workerArgs);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 860,
    minWidth: 1160,
    minHeight: 860,
    maxWidth: 1160,
    maxHeight: 860,
    show: false,
    frame: isMac,
    resizable: false,
    maximizable: false,
    fullscreenable: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    backgroundColor: "#201d1d",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!isMac) {
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.on("close", (event) => {
    if (!isMac || isShuttingDown) {
      return;
    }

    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    syncStatusMenus();
  });

  mainWindow.on("show", syncStatusMenus);
  mainWindow.on("hide", syncStatusMenus);
  mainWindow.on("minimize", syncStatusMenus);

  mainWindow.on("enter-full-screen", () => emitWindowState(mainWindow));
  mainWindow.on("leave-full-screen", () => emitWindowState(mainWindow));
  mainWindow.on("restore", () => {
    emitWindowState(mainWindow);
    syncStatusMenus();
  });

  if (!smokeTest) {
    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
      emitWindowState(mainWindow);
      syncStatusMenus();
    });
  }

  await mainWindow.loadURL(`${runtime.baseUrl}/dashboard`);

  if (smokeTest) {
    setTimeout(() => app.quit(), 1_000).unref();
  }
}

ipcMain.on(WINDOW_CONTROL_CHANNEL, (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return;
  }

  if (action === "minimize") {
    window.minimize();
    return;
  }

  if (action === "close") {
    window.close();
  }
});

ipcMain.handle(WINDOW_STATE_REQUEST_CHANNEL, (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? getWindowState(window) : { isFullScreen: false };
});

app.on("before-quit", shutdownChildren);

app.whenReady().then(async () => {
  await startRuntime();
  installApplicationMenu();
  createTray();
  await createMainWindow();
  syncStatusMenus();

  app.on("activate", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
      return;
    }

    if (BrowserWindow.getAllWindows().length === 0 && runtime) {
      await createMainWindow();
    }
  });
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  log(`startup failed: ${message}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest) {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});