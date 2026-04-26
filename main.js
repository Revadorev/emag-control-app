const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow
let processes = {
  login: null,
  watch: null,
  sync: null,
  scrape: null,
  full: null,
}

function getBasePath() {
  return app.isPackaged ? process.resourcesPath : __dirname
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 750,
    minHeight: 550,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'eMAG Control Panel',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
  })
  mainWindow.loadFile('renderer.html')
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  Object.values(processes).forEach(p => p && p.kill())
  app.quit()
})

// ─── Helper: ruleaza un script node ──────────────────────────────────────────
function runScript(key, scriptName, onDone) {
  if (processes[key]) {
    sendLog(key, `⚠️ Deja rulează.`)
    return false
  }
  const basePath = getBasePath()
  const scriptPath = path.join(basePath, 'crawler', scriptName)
  sendLog(key, `▶ Pornesc ${scriptName}...`)

  const proc = spawn('node', [scriptPath], {
    cwd: basePath,
    env: { ...process.env },
  })
  processes[key] = proc

  proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => sendLog(key, l)))
  proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => sendLog(key, '⚠️ ' + l)))
  proc.on('close', code => {
    processes[key] = null
    sendLog(key, code === 0 ? `✅ ${scriptName} finalizat.` : `❌ ${scriptName} inchis (cod ${code})`)
    mainWindow?.webContents.send(`${key}-stopped`, { code })
    if (onDone) onDone(code)
  })

  mainWindow?.webContents.send(`${key}-started`)
  return true
}

// ─── Login ────────────────────────────────────────────────────────────────────
ipcMain.handle('start-login', () => {
  runScript('login', 'setup-login.js')
  return { ok: true }
})
ipcMain.handle('stop-login', () => {
  if (processes.login) { processes.login.kill(); processes.login = null }
  sendLog('login', '🛑 Oprit.')
  mainWindow?.webContents.send('login-stopped', {})
})

// ─── Watch ────────────────────────────────────────────────────────────────────
ipcMain.handle('start-watch', () => {
  runScript('watch', 'watch.js')
  return { ok: true }
})
ipcMain.handle('stop-watch', () => {
  if (processes.watch) { processes.watch.kill(); processes.watch = null }
  sendLog('watch', '🛑 Oprit.')
  mainWindow?.webContents.send('watch-stopped', {})
})

// ─── Sync produse ─────────────────────────────────────────────────────────────
ipcMain.handle('start-sync', () => {
  runScript('sync', 'sync-products.js')
  return { ok: true }
})
ipcMain.handle('stop-sync', () => {
  if (processes.sync) { processes.sync.kill(); processes.sync = null }
  sendLog('sync', '🛑 Oprit.')
  mainWindow?.webContents.send('sync-stopped', {})
})

// ─── Scrape recenzii ──────────────────────────────────────────────────────────
ipcMain.handle('start-scrape', () => {
  runScript('scrape', 'index.js')
  return { ok: true }
})
ipcMain.handle('stop-scrape', () => {
  if (processes.scrape) { processes.scrape.kill(); processes.scrape = null }
  sendLog('scrape', '🛑 Oprit.')
  mainWindow?.webContents.send('scrape-stopped', {})
})

// ─── Sync complet (sync → scrape in serie) ────────────────────────────────────
ipcMain.handle('start-full', () => {
  if (processes.full || processes.sync || processes.scrape) {
    sendLog('full', '⚠️ Un proces rulează deja.')
    return { ok: false }
  }
  sendLog('full', '🚀 Sync complet pornit: Pas 1/2 — Sync produse...')
  runScript('sync', 'sync-products.js', (code) => {
    if (code === 0) {
      sendLog('full', '✅ Produse sincronizate. Pas 2/2 — Scrape recenzii...')
      runScript('scrape', 'index.js', (code2) => {
        sendLog('full', code2 === 0 ? '🎉 Sync complet finalizat!' : '❌ Scrape esuat.')
        mainWindow?.webContents.send('full-stopped', {})
      })
    } else {
      sendLog('full', '❌ Sync produse esuat, scrape anulat.')
      mainWindow?.webContents.send('full-stopped', {})
    }
  })
  mainWindow?.webContents.send('full-started')
  return { ok: true }
})
ipcMain.handle('stop-full', () => {
  if (processes.sync) { processes.sync.kill(); processes.sync = null }
  if (processes.scrape) { processes.scrape.kill(); processes.scrape = null }
  sendLog('full', '🛑 Sync complet oprit.')
  mainWindow?.webContents.send('full-stopped', {})
})

// ─── Status ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-status', () => ({
  login: !!processes.login,
  watch: !!processes.watch,
  sync: !!processes.sync,
  scrape: !!processes.scrape,
  full: !!(processes.sync || processes.scrape),
}))

function sendLog(channel, msg) {
  if (!msg?.trim()) return
  mainWindow?.webContents.send('log', { channel, msg: msg.trim() })
}
