'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// ── Session parsing ──────────────────────────────────────────────────────────

function extractFirstMessage(data) {
  if (data.type !== 'user' || !data.message) return null;
  const content = data.message.content;
  if (typeof content === 'string') return content.slice(0, 250).trim();
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && part.type === 'text' && part.text) return part.text.slice(0, 250).trim();
    }
  }
  return null;
}

function parseSessionFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return null; }

  const lines = content.split('\n').filter(l => l.trim());
  let cwd = null, sessionId = null, firstTimestamp = null, lastTimestamp = null;
  let firstMessage = null, messageCount = 0;

  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (!cwd && d.cwd) cwd = d.cwd;
      if (!sessionId && d.sessionId) sessionId = d.sessionId;
      if (!firstTimestamp && d.timestamp) firstTimestamp = d.timestamp;
      if (d.timestamp) lastTimestamp = d.timestamp;
      if (d.type === 'user' && d.message) {
        messageCount++;
        if (!firstMessage) firstMessage = extractFirstMessage(d);
      }
    } catch { /* skip malformed lines */ }
  }

  if (!sessionId) sessionId = path.basename(filePath, '.jsonl');
  if (!cwd) return null;

  return { sessionId, cwd, firstMessage: firstMessage || '', firstTimestamp, lastTimestamp, messageCount };
}

function getAllSessions() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const sessions = [];

  for (const dirName of fs.readdirSync(PROJECTS_DIR)) {
    const dirPath = path.join(PROJECTS_DIR, dirName);
    try {
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith('.jsonl')) continue;
        const s = parseSessionFile(path.join(dirPath, file));
        if (s) sessions.push(s);
      }
    } catch { /* skip unreadable dirs */ }
  }

  return sessions.sort((a, b) => (b.lastTimestamp || '').localeCompare(a.lastTimestamp || ''));
}

// ── Terminal launcher ────────────────────────────────────────────────────────

function launchTerminal(cwd, sessionId, mode) {
  const resumeCmd = `claude -r ${sessionId}`;

  switch (process.platform) {

    case 'win32': {
      const safeCwd = cwd.replace(/'/g, "''");
      const psCmd = mode === 'resume'
        ? `Set-Location '${safeCwd}'; ${resumeCmd}`
        : `Set-Location '${safeCwd}'`;
      const encoded = Buffer.from(psCmd, 'utf16le').toString('base64');

      // "start" de cmd.exe siempre crea una nueva consola — necesario desde apps GUI como Electron
      exec(`start "" powershell.exe -NoExit -EncodedCommand ${encoded}`, (err) => {
        if (err) console.error('[win launch error]', err.message);
      });
      break;
    }

    case 'darwin': {
      // Escribe un .command (se abre automáticamente en Terminal.app con open)
      const safeCwd = cwd.replace(/"/g, '\\"');
      const lines = ['#!/bin/bash', `cd "${safeCwd}"`];
      if (mode === 'resume') lines.push(resumeCmd);
      lines.push('exec bash'); // mantiene la ventana abierta

      const tmpScript = path.join(os.tmpdir(), `cl-${Date.now()}.command`);
      fs.writeFileSync(tmpScript, lines.join('\n'), { mode: 0o755 });

      const child = spawn('open', [tmpScript], { detached: true, stdio: 'ignore' });
      child.on('error', err => console.error('[mac launch error]', err.message));
      child.unref();

      setTimeout(() => { try { fs.unlinkSync(tmpScript); } catch {} }, 30000);
      break;
    }

    case 'linux': {
      const safeCwd = cwd.replace(/"/g, '\\"');
      const bashCmd = mode === 'resume'
        ? `cd "${safeCwd}"; ${resumeCmd}; exec bash`
        : `cd "${safeCwd}"; exec bash`;

      // Prueba terminales en orden de preferencia
      const terminals = [
        ['gnome-terminal', ['--', 'bash', '-c', bashCmd]],
        ['konsole',        ['-e', 'bash', '-c', bashCmd]],
        ['xfce4-terminal', ['--command', `bash -c '${bashCmd.replace(/'/g, "'\\''")}'`]],
        ['xterm',          ['-e', `bash -c '${bashCmd.replace(/'/g, "'\\''")}'`]],
      ];

      const tryNext = (idx) => {
        if (idx >= terminals.length) { console.error('[linux] No se encontró ningún terminal'); return; }
        const [bin, args] = terminals[idx];
        const child = spawn(bin, args, { detached: true, stdio: 'ignore' });
        child.on('error', () => tryNext(idx + 1));
        child.on('spawn', () => child.unref());
      };
      tryNext(0);
      break;
    }

    default:
      console.error('[launch] Plataforma no soportada:', process.platform);
  }
}

// ── Electron app ─────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0e0e10',
    title: 'Claude Sessions',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    win.center();
    win.focus();
    win.flashFrame(true); // parpadea en taskbar si no puede tomar el foco
  });
}

app.whenReady().then(() => {
  ipcMain.handle('sessions:get', () => getAllSessions());

  ipcMain.handle('launch:terminal', (_event, { cwd, sessionId, mode }) => {
    try {
      launchTerminal(cwd, sessionId, mode);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
