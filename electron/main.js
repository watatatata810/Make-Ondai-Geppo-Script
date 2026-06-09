import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { marked } from 'marked';
import Store from 'electron-store';
import { extractExcelData } from './excelParser.js';
import { generateReport, getAvailableModels } from './geminiClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const store = new Store();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load the React app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(rootDir, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// === IPC Handlers ===

// API Key Management
ipcMain.handle('get-api-key', () => store.get('gemini-api-key', ''));
ipcMain.handle('set-api-key', (event, key) => {
  store.set('gemini-api-key', key);
  return true;
});

// Model Management
ipcMain.handle('get-available-models', async (event, apiKey) => {
  return await getAvailableModels(apiKey);
});
ipcMain.handle('get-selected-model', () => store.get('gemini-selected-model', 'gemini-3.5-flash'));
ipcMain.handle('set-selected-model', (event, modelName) => {
  store.set('gemini-selected-model', modelName);
  return true;
});

// File Selection
ipcMain.handle('select-excel-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  
  const filePath = result.filePaths[0];
  const filename = path.basename(filePath);
  
  let campusName = "不明なキャンパス";
  if (filename.includes("池袋")) campusName = "池袋キャンパス";
  else if (filename.includes("中目黒")) campusName = "中目黒キャンパス";

  return { filePath, filename, campusName };
});

// Prompt Management
ipcMain.handle('get-prompt', async () => {
  try {
    const customPrompt = store.get('custom-prompt');
    if (customPrompt) {
      return { text: customPrompt, isCustom: true };
    }
    const promptPath = path.join(rootDir, 'Prompt.md');
    if (await fs.pathExists(promptPath)) {
      const text = await fs.readFile(promptPath, 'utf-8');
      return { text, isCustom: false };
    }
    return { text: '', isCustom: false };
  } catch (error) {
    console.error(error);
    return { text: '', isCustom: false, error: error.message };
  }
});

ipcMain.handle('save-prompt', async (event, text) => {
  try {
    const promptPath = path.join(rootDir, 'Prompt.md');
    let defaultText = '';
    if (await fs.pathExists(promptPath)) {
      defaultText = await fs.readFile(promptPath, 'utf-8');
    }

    // 改行コード（CRLF/LF）と前後の空白を正規化して比較
    const normalizedText = text.replace(/\r\n/g, '\n').trim();
    const normalizedDefault = defaultText.replace(/\r\n/g, '\n').trim();

    let isCustom = true;
    if (normalizedText === normalizedDefault) {
      store.delete('custom-prompt');
      isCustom = false;
    } else {
      store.set('custom-prompt', text);
    }
    return { success: true, isCustom };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reset-prompt', async () => {
  try {
    store.delete('custom-prompt');
    const promptPath = path.join(rootDir, 'Prompt.md');
    if (await fs.pathExists(promptPath)) {
      const text = await fs.readFile(promptPath, 'utf-8');
      return { success: true, text };
    }
    return { success: true, text: '' };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-history', async () => {
  try {
    return store.get('report-history') || [];
  } catch (error) {
    console.error(error);
    return [];
  }
});

ipcMain.handle('save-history', async (event, history) => {
  try {
    store.set('report-history', history);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

// Markdown Generation
ipcMain.handle('generate-markdown', async (event, { filePath, campusName }) => {
  try {
    const apiKey = store.get('gemini-api-key');
    if (!apiKey) throw new Error('APIキーが設定されていません。画面右上から設定してください。');

    let promptTemplate = store.get('custom-prompt');
    if (!promptTemplate) {
      const promptPath = path.join(rootDir, 'Prompt.md');
      if (!await fs.pathExists(promptPath)) throw new Error('Prompt.md が見つかりません。');
      promptTemplate = await fs.readFile(promptPath, 'utf-8');
    }
    const excelData = extractExcelData(filePath);
    
    const modelName = store.get('gemini-selected-model') || 'gemini-3.1-flash-lite';
    const markdownContent = await generateReport(apiKey, promptTemplate, excelData, campusName, modelName);
    return { success: true, markdown: markdownContent };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

// PDF Generation (Using Electron Native printToPDF)
ipcMain.handle('generate-pdf', async (event, { markdownContent, padding }) => {
  const tempFilePath = path.join(rootDir, 'temp_print.html');
  try {
    const htmlContent = marked(markdownContent);
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background-color: white;
            width: fit-content;
            min-width: 800px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            color: #24292e;
          }
          .markdown-body {
            box-sizing: border-box;
            margin: 0;
            padding: ${padding}px;
            width: fit-content;
            min-width: 100%;
            display: block;
          }
          .markdown-body > *:last-child {
            margin-bottom: 0 !important;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: #1f2328;
            white-space: nowrap !important;
          }
          h1 {
            font-size: 2em;
            padding-bottom: 0.3em;
            border-bottom: 1px solid #d0d7de;
          }
          h2 {
            font-size: 1.5em;
            padding-bottom: 0.3em;
            border-bottom: 1px solid #d0d7de;
          }
          h3 {
            font-size: 1.25em;
          }
          p, li {
            font-size: 16px;
            line-height: 1.6;
            white-space: normal !important;
            max-width: 800px;
            margin-top: 0;
            margin-bottom: 16px;
          }
          ul, ol {
            padding-left: 2em;
            margin-top: 0;
            margin-bottom: 16px;
          }
          table {
            border-spacing: 0;
            border-collapse: collapse;
            width: 100%;
            margin-top: 0;
            margin-bottom: 16px;
            display: table;
            break-inside: avoid;
          }
          table th {
            font-weight: 600;
            background-color: #f6f8fa;
          }
          table th, table td {
            padding: 6px 13px;
            border: 1px solid #d0d7de;
            white-space: nowrap !important;
          }
          table tr {
            background-color: #ffffff;
            border-top: 1px solid #d0d7de;
          }
          table tr:nth-child(2n) {
            background-color: #f6f8fa;
          }
          hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #d0d7de;
            border: 0;
          }
          img, pre {
            break-inside: avoid;
          }
        </style>
      </head>
      <body class="markdown-body">
        ${htmlContent}
      </body>
      </html>
    `;

    // ワークスペース内に一時HTMLファイルを書き出し
    await fs.writeFile(tempFilePath, fullHtml, 'utf8');

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    await printWindow.loadFile(tempFilePath);

    // スタイルとレンダリングの適用を確認するために少し待機
    await new Promise(resolve => setTimeout(resolve, 500));

    // 高さを計算し、ダイナミックな用紙サイズをCSSの@pageとして注入する
    await printWindow.webContents.executeJavaScript(`
      (() => {
        const bodyEl = document.querySelector('.markdown-body') || document.body;
        const width = bodyEl.scrollWidth;
        // 小数点以下の丸め誤差や、レンダリングの僅かなズレで2ページ目に溢れるのを防ぐため、50pxの安全バッファを追加
        const height = bodyEl.scrollHeight + 50; 
        const style = document.createElement('style');
        // ElectronのpreferCSSPageSizeを利用して改ページ無しの1枚PDFを強制する
        style.textContent = '@page { size: ' + width + 'px ' + height + 'px; margin: 0; }';
        document.head.appendChild(style);
      })();
    `);

    // CSSの@pageサイズ設定を優先してPDFを出力（ページ分割を防ぐ）
    const pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' } // Chromiumのデフォルトマージンを強制的に無効化
    });

    printWindow.close();
    
    // 一時ファイルの削除
    await fs.remove(tempFilePath);

    // IPC転送用にBufferをArrayにシリアライズ
    return { success: true, pdfBuffer: Array.from(pdfBuffer) }; 
  } catch (error) {
    console.error(error);
    if (await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
    return { success: false, error: error.message };
  }
});

// Save PDF Dialog
ipcMain.handle('save-pdf', async (event, { pdfBuffer, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || '月報.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
  });

  if (!canceled && filePath) {
    await fs.writeFile(filePath, Buffer.from(pdfBuffer));
    return { success: true, path: filePath };
  }
  return { success: false, canceled: true };
});
