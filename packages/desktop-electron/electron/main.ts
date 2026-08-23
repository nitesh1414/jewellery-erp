import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { userDataPaths, ensureUserDataDirs, isPackaged } from './paths';
import { getMachineId, formatMachineId } from './machine-id';
import { LicenseManager } from './license-manager';
import { startBackend, BackendHandle } from './backend-manager';
import type { LicenseEvaluation } from '@jewellery-erp/license-core';

// --------------------------------------------------------------------------
// Single instance
// --------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  main().catch((err) => {
    dialog.showErrorBox('Jewellery ERP', `Fatal startup error:\n${err?.stack || err}`);
    app.exit(1);
  });
}

let mainWindow: BrowserWindow | null = null;
let backend: BackendHandle | null = null;
let licenseManager: LicenseManager | null = null;
let machineId = '';
let quitting = false;
let guardActive = false;

function log(line: string): void {
  try {
    fs.appendFileSync(userDataPaths.appLog(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* ignore */
  }
}

async function main(): Promise<void> {
  await app.whenReady();
  ensureUserDataDirs();

  machineId = await getMachineId();
  licenseManager = new LicenseManager(machineId);
  log(`machineId=${formatMachineId(machineId)} version=${app.getVersion()} platform=${process.platform}`);

  registerIpc();

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });

  app.on('before-quit', () => {
    quitting = true;
    licenseManager?.markSeen();
  });
  app.on('will-quit', () => {
    backend?.child.kill();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });

  // Licence pre-seeded by the installer (silent installs: installer /LICENSEKEY=…)
  consumePendingLicenseKey();

  await boot();
  startPeriodicChecks();
}

// --------------------------------------------------------------------------
// Window
// --------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Shri Jewellers ERP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Never show a silent blank window — surface load failures
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`did-fail-load ${code} ${desc} ${url}`);
    if (code === -3) return; // aborted (navigation replaced)
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'Page failed to load',
      message: `A page failed to load (${code}: ${desc}).`,
      detail: `${url}\n\nLogs: ${userDataPaths.appLog()}`,
      buttons: ['Open logs', 'Ignore'],
    }).then(({ response }) => {
      if (response === 0) shell.openPath(userDataPaths.logsDir());
    });
  });
  // In-app pages (e.g. print views) open as proper child windows; anything
  // external (https://…) goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (backend && (url.startsWith(backend.baseUrl + '/') || url === backend.baseUrl)) {
      openChildWindow(win, url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  return win;
}

function openChildWindow(parent: BrowserWindow, url: string): void {
  const child = new BrowserWindow({
    width: 860,
    height: 1000,
    parent,
    title: 'Print',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  child.loadURL(url);
}

// --------------------------------------------------------------------------
// Boot / guard flow
// --------------------------------------------------------------------------

async function boot(): Promise<void> {
  const evaluation = licenseManager!.evaluate();
  if (evaluation.valid) {
    await launchApp();
  } else {
    await showGuardScreen(evaluation);
  }
}

/** Start local backend + load the ERP UI. */
async function launchApp(): Promise<void> {
  if (!mainWindow) mainWindow = createWindow();
  guardActive = false;
  try {
    if (!backend) {
      backend = await startBackend(LicenseManager.appSecret(), (code) => {
        log(`backend exited unexpectedly code=${code}`);
        backend = null;
        if (!quitting) {
          new Notification({
            title: 'Jewellery ERP',
            body: 'The local database service stopped. The app will restart it.',
          }).show();
          if (!guardActive) {
            launchApp().catch(showBackendError);
          }
        }
      });
      log(`backend started on port ${backend.port}`);
    }
    await mainWindow.loadURL(backend.baseUrl);
    mainWindow.webContents.once('did-finish-load', () => {
      notifyExpiryIfSoon();
    });
  } catch (err: any) {
    log(`launchApp failed: ${err?.message}`);
    showBackendError(err);
  }
}

function showBackendError(err: Error): void {
  guardActive = true;
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  const msg = `The application database failed to start.\n\n${err.message}`;
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Backend error',
    message: msg,
    detail: `Logs: ${userDataPaths.backendLog()}`,
    buttons: ['Open logs', 'Retry', 'Quit'],
  }).then(({ response }) => {
    if (response === 0) shell.openPath(userDataPaths.logsDir());
    else if (response === 1) {
      guardActive = false;
      launchApp().catch(showBackendError);
    } else app.quit();
  });
}

/** Blocking subscription screen (activation / expired / revoked / …). */
async function showGuardScreen(evaluation: LicenseEvaluation): Promise<void> {
  guardActive = true;
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  log(`guard screen: ${evaluation.code}`);
  const devUrl = process.env.DESKTOP_ACTIVATION_URL; // vite dev server, if any
  const mode = evaluation.code === 'VALID' ? 'starting' : evaluation.code.toLowerCase();
  const search = `?mode=${encodeURIComponent(mode)}`;
  if (devUrl) {
    await mainWindow.loadURL(`${devUrl}${search}`);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'activation.html'), { search });
  }
}

function consumePendingLicenseKey(): void {
  try {
    const key = fs.readFileSync(userDataPaths.pendingKeyFile(), 'utf8').trim();
    if (key) {
      log('found installer-provided license key — pre-activating');
      licenseManager!
        .activateOnline(key)
        .then((res) => {
          log(`pre-activation result: ${res.ok}`);
          if (!res.ok) {
            // keep the file? no — surface the error on the activation screen
            fs.unlinkSync(userDataPaths.pendingKeyFile());
          } else {
            fs.unlinkSync(userDataPaths.pendingKeyFile());
            boot(); // re-evaluate → launch app
          }
        })
        .catch((e) => log(`pre-activation error: ${e}`));
    }
  } catch {
    /* no pending key */
  }
}

// Periodic: watermark clock, pick up revocations/extensions, re-check expiry.
function startPeriodicChecks(): void {
  const every6h = 6 * 60 * 60 * 1000;
  setInterval(
    () => {
      licenseManager?.markSeen();
      licenseManager
        ?.revalidateOnline()
        .then(() => {
          const evaluation = licenseManager!.evaluate();
          if (!evaluation.valid && !guardActive && !quitting) {
            log(`license became invalid during runtime: ${evaluation.code}`);
            backend?.child.kill();
            backend = null;
            showGuardScreen(evaluation);
          }
        })
        .catch(() => undefined);
    },
    every6h,
  );
  // also check expiry hourly without network
  setInterval(
    () => {
      const evaluation = licenseManager?.evaluate();
      if (evaluation && !evaluation.valid && !guardActive && !quitting) {
        backend?.child.kill();
        backend = null;
        showGuardScreen(evaluation);
      }
    },
    60 * 60 * 1000,
  );
}

function notifyExpiryIfSoon(): void {
  const evaluation = licenseManager?.evaluate();
  const days = evaluation?.daysRemaining;
  if (evaluation?.valid && days !== null && days !== undefined && days <= 7 && Notification.isSupported()) {
    new Notification({
      title: 'Subscription expiring soon',
      body: `Your Jewellery ERP subscription expires in ${days} day(s). Contact your vendor to renew.`,
    }).show();
  }
}

// --------------------------------------------------------------------------
// IPC
// --------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    platform: `${process.platform} ${process.arch}`,
    backendRunning: !!backend,
    backendBaseUrl: backend?.baseUrl ?? null,
  }));

  ipcMain.handle('license:getStatus', () => {
    const evaluation = licenseManager!.evaluate();
    return {
      code: evaluation.code,
      valid: evaluation.valid,
      message: evaluation.message,
      machineId,
      serverUrl: licenseManager!.getServerUrl(),
      license: evaluation.license
        ? {
            licenseKey: evaluation.license.licenseKey,
            planType: evaluation.license.planType,
            expiresAt: evaluation.license.expiresAt,
            daysRemaining: evaluation.daysRemaining ?? null,
          }
        : null,
    };
  });

  ipcMain.handle('license:activate', async (_e, key: string, serverUrl?: string) => {
    try {
      const res = await licenseManager!.activateOnline(key, serverUrl);
      if (res.ok && res.evaluation?.code === 'CLOCK_TAMPERED') {
        // trusted server response clears the tamper watermark
        licenseManager!.clearTamperFlag();
      }
      if (res.ok) {
        launchApp().catch(() => undefined);
      }
      return { ok: res.ok, message: res.message };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Activation failed' };
    }
  });

  ipcMain.handle('license:activateOffline', (_e, blob: string) => {
    try {
      const res = licenseManager!.activateOffline(blob);
      if (res.ok) {
        launchApp().catch(() => undefined);
      }
      return { ok: res.ok, message: res.message };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Activation failed' };
    }
  });

  ipcMain.handle('license:setServerUrl', (_e, url: string) => {
    try {
      licenseManager!.setServerUrl(url);
      return { ok: true, message: 'Saved' };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Invalid URL' };
    }
  });

  ipcMain.handle('app:openLogs', () => {
    shell.openPath(userDataPaths.logsDir());
  });

  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.quit();
  });
}

export {}; // keep tsc happy about the module being a program entry
