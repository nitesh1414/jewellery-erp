import * as fs from 'fs';
import * as path from 'path';
import { app, utilityProcess, UtilityProcess } from 'electron';
import { backendEntry, templateDb, frontendDist, userDataPaths, isPackaged } from './paths';

export interface BackendHandle {
  port: number;
  baseUrl: string;
  child: UtilityProcess;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const net = require('net') as typeof import('net');
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Copy the pristine database shipped with the installer on first run. */
export function ensureDatabase(): void {
  const dbFile = userDataPaths.dbFile();
  if (fs.existsSync(dbFile)) return;
  const template = templateDb();
  if (!fs.existsSync(template)) {
    throw new Error(`Database template not found at ${template}`);
  }
  fs.copyFileSync(template, dbFile);
}

export async function startBackend(jwtSecret: string, onExit?: (code: number) => void): Promise<BackendHandle> {
  ensureDatabase();

  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`Backend not found at ${entry}. ${isPackaged() ? 'The installation looks damaged — reinstall the app.' : 'Run `npm run build -w packages/backend` first.'}`);
  }

  const port = await getFreePort();
  const logStream = fs.createWriteStream(userDataPaths.backendLog(), { flags: 'a' });
  logStream.write(`\n===== backend start ${new Date().toISOString()} (port ${port}) =====\n`);

  const child = utilityProcess.fork(entry, [], {
    serviceName: 'jewellery-erp-backend',
    stdio: 'pipe',
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: `file:${userDataPaths.dbFile()}`,
      UPLOAD_DIR: userDataPaths.uploadsDir(),
      FRONTEND_DIST: frontendDist(),
      JWT_SECRET: jwtSecret,
      CORS_ORIGIN: `http://127.0.0.1:${port},http://localhost:${port}`,
    },
  });

  child.stdout?.on('data', (d) => logStream.write(d));
  child.stderr?.on('data', (d) => logStream.write(d));
  child.on('exit', (code) => {
    logStream.write(`\n===== backend exit code=${code} =====\n`);
    logStream.end();
    onExit?.(code ?? -1);
  });

  // Wait until /api/health responds (first boot may take a few seconds).
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  let exited = false;
  child.once('exit', () => (exited = true));

  while (Date.now() < deadline) {
    if (exited) throw new Error('The local backend exited during startup. Check the log file for details.');
    if (await isHealthy(baseUrl)) {
      return { port, baseUrl, child };
    }
    await sleep(400);
  }
  child.kill();
  throw new Error('The local backend did not start within 90 seconds. Check the log file for details.');
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
