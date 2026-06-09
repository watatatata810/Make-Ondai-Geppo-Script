const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // APIキー関連
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  
  // モデル管理関連
  getAvailableModels: (apiKey) => ipcRenderer.invoke('get-available-models', apiKey),
  getSelectedModel: () => ipcRenderer.invoke('get-selected-model'),
  setSelectedModel: (modelName) => ipcRenderer.invoke('set-selected-model', modelName),
  
  // ファイル操作
  selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),
  savePdf: (pdfBuffer, defaultName) => ipcRenderer.invoke('save-pdf', { pdfBuffer, defaultName }),
  
  // 生成処理
  generateMarkdown: (filePath, campusName) => ipcRenderer.invoke('generate-markdown', { filePath, campusName }),
  generatePdf: (markdownContent, padding) => ipcRenderer.invoke('generate-pdf', { markdownContent, padding }),
  
  // プロンプト管理
  getPrompt: () => ipcRenderer.invoke('get-prompt'),
  savePrompt: (text) => ipcRenderer.invoke('save-prompt', text),
  resetPrompt: () => ipcRenderer.invoke('reset-prompt'),

  // 履歴管理
  getHistory: () => ipcRenderer.invoke('get-history'),
  saveHistory: (history) => ipcRenderer.invoke('save-history', history)
});
