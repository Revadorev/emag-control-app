const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  startLogin: () => ipcRenderer.invoke('start-login'),
  stopLogin: () => ipcRenderer.invoke('stop-login'),
  startWatch: () => ipcRenderer.invoke('start-watch'),
  stopWatch: () => ipcRenderer.invoke('stop-watch'),
  startSync: () => ipcRenderer.invoke('start-sync'),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  startScrape: () => ipcRenderer.invoke('start-scrape'),
  stopScrape: () => ipcRenderer.invoke('stop-scrape'),
  startFull: () => ipcRenderer.invoke('start-full'),
  stopFull: () => ipcRenderer.invoke('stop-full'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  onLog: (cb) => ipcRenderer.on('log', (_, d) => cb(d)),
  on: (event, cb) => ipcRenderer.on(event, cb),
})
