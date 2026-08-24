import { contextBridge, ipcRenderer } from 'electron';

/**
 * Bridge exposed to renderer pages:
 *  - the activation screen (bundled in this package)
 *  - the main ERP UI served by the local backend (optional license chip)
 */
contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktop: true,

  getInfo: (): Promise<DesktopInfo> => ipcRenderer.invoke('app:getInfo'),
  getLicenseStatus: (): Promise<DesktopLicenseStatus> => ipcRenderer.invoke('license:getStatus'),
  activate: (licenseKey: string, serverUrl?: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('license:activate', licenseKey, serverUrl),
  activateOffline: (blob: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('license:activateOffline', blob),
  setServerUrl: (url: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('license:setServerUrl', url),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
});

export interface DesktopInfo {
  version: string;
  platform: string;
  backendRunning: boolean;
  backendBaseUrl: string | null;
}

export interface DesktopLicenseStatus {
  code: string;
  valid: boolean;
  message: string;
  machineId: string;
  serverUrl: string;
  license: {
    licenseKey: string;
    planType: string;
    expiresAt: string | null;
    daysRemaining: number | null;
  } | null;
}
