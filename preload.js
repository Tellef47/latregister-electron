const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:    ()       => ipcRenderer.invoke('load-data'),
  saveData:    (data)   => ipcRenderer.invoke('save-data', data),
  loadNoter:   ()       => ipcRenderer.invoke('load-noter'),
  saveNoter:   (n)      => ipcRenderer.invoke('save-noter', n),
  loadNoter2:  ()       => ipcRenderer.invoke('load-noter2'),
  saveNoter2:  (n)      => ipcRenderer.invoke('save-noter2', n),
  openPDF:     (path)   => ipcRenderer.invoke('open-pdf', path),
  pickPDF:     ()       => ipcRenderer.invoke('pick-pdf'),
  openGraph:   (data)   => ipcRenderer.invoke('open-graph', data),
  pickFolder:  ()       => ipcRenderer.invoke('pick-folder'),
})
