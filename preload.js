'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claude', {
  getSessions: ()     => ipcRenderer.invoke('sessions:get'),
  launch:      (data) => ipcRenderer.invoke('launch:terminal', data),
});
