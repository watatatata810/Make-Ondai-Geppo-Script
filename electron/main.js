import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import Store from 'electron-store';
import { extractExcelData } from './excelParser.js';
import { generateReport, getAvailableModels } from './geminiClient.js';
import { processGeneratedReport } from './reportNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// package.json トップレベルの productName 追加（'md-to-pdf-gui' -> 'Make-Ondai-Geppo'）に伴い、
// Electronのuserdataフォルダ名が変わる（app.name は productName を name より優先するため。
// 参照: node_modules/electron/electron.d.ts の app.getName() 説明文）。
// electron-store の Store インスタンスは内部で app.getPath('userData') を参照するため、
// Store生成より前に旧フォルダのconfig.jsonを新フォルダへ一度だけ移行する。
function migrateUserDataFolder() {
  try {
    const appDataDir = app.getPath('appData');
    const oldConfigPath = path.join(appDataDir, 'md-to-pdf-gui', 'config.json');
    const newUserDataDir = app.getPath('userData');
    const newConfigPath = path.join(newUserDataDir, 'config.json');

    if (fs.pathExistsSync(oldConfigPath) && !fs.pathExistsSync(newConfigPath)) {
      fs.ensureDirSync(newUserDataDir);
      fs.copySync(oldConfigPath, newConfigPath);
      console.log(`旧設定フォルダから設定を移行しました: ${oldConfigPath} -> ${newConfigPath}`);
    }
  } catch (error) {
    console.error('userDataフォルダの移行に失敗しました:', error);
  }
}

migrateUserDataFolder();

const store = new Store();

// --- APIキーの safeStorage 暗号化（Windows: DPAPI）保存 ---
// 旧キー 'gemini-api-key'（平文）は後方互換のため読み取りにのみ対応し、
// 新キー 'gemini-api-key-encrypted' には safeStorage.encryptString の結果をbase64化して保存する。
const LEGACY_API_KEY_STORE_KEY = 'gemini-api-key';
const ENCRYPTED_API_KEY_STORE_KEY = 'gemini-api-key-encrypted';

function getDecryptedApiKey() {
  const encryptedBase64 = store.get(ENCRYPTED_API_KEY_STORE_KEY);
  if (encryptedBase64) {
    try {
      return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
    } catch (error) {
      console.error('APIキーの復号に失敗しました:', error);
      return '';
    }
  }
  // 暗号化保存への移行前、または暗号化が利用できない環境向けのフォールバック
  return store.get(LEGACY_API_KEY_STORE_KEY, '');
}

function saveApiKey(key) {
  if (safeStorage.isEncryptionAvailable()) {
    const encryptedBase64 = safeStorage.encryptString(key).toString('base64');
    store.set(ENCRYPTED_API_KEY_STORE_KEY, encryptedBase64);
    store.delete(LEGACY_API_KEY_STORE_KEY);
  } else {
    console.warn('safeStorageによる暗号化がこの環境では利用できないため、APIキーを平文で保存します。');
    store.set(LEGACY_API_KEY_STORE_KEY, key);
  }
}

// 起動時に一度だけ、平文で保存された旧キーを暗号化保存へ移行する。
// safeStorage.isEncryptionAvailable() はWindowsでは app の ready イベント後にのみ
// 正しい値を返すため（node_modules/electron/electron.d.ts 参照）、この関数は
// app.whenReady().then() の中で呼び出す。
function migrateApiKeyToSafeStorage() {
  const plainKey = store.get(LEGACY_API_KEY_STORE_KEY);
  const alreadyMigrated = store.has(ENCRYPTED_API_KEY_STORE_KEY);
  if (!plainKey || alreadyMigrated) return;

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encryptedBase64 = safeStorage.encryptString(plainKey).toString('base64');
      store.set(ENCRYPTED_API_KEY_STORE_KEY, encryptedBase64);
      store.delete(LEGACY_API_KEY_STORE_KEY);
      console.log('APIキーをsafeStorageによる暗号化保存へ移行しました。');
    } catch (error) {
      console.error('APIキーの暗号化移行に失敗しました。平文のまま維持します:', error);
    }
  } else {
    console.warn('この環境ではsafeStorageによる暗号化が利用できないため、APIキーは平文のまま維持されます。');
  }
}

// PDF/レンダラーのCSPと同等のポリシー。file://で読み込む一時HTML（PDF印刷用）にも適用する。
const CSP_META_CONTENT = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

// Gemini生成のタイムアウト（10分）。ユーザーによる手動キャンセルもこのcontrollerを通じて行う。
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
let activeGenerationController = null;

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
  migrateApiKeyToSafeStorage();
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
ipcMain.handle('get-api-key', () => getDecryptedApiKey());
ipcMain.handle('set-api-key', (event, key) => {
  saveApiKey(key);
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
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const filename = path.basename(filePath);

  // キャンパス名の判定はrenderer側（src/campusUtils.js）に一本化し、
  // ここでは判定を行わない（ドラッグ&ドロップ経路と判定ロジックを重複させないため）。
  return { filePath, filename };
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
  let timeoutId;
  let controller;
  try {
    // --- 入力検証（多層防御） ---
    // ドラッグ&ドロップ経路もあるため、ダイアログ由来パスへの完全なホワイトリスト化はしないが、
    // 型・拡張子・実在チェックのみは必ず行う。
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('無効なファイルパスです。エクセルファイルを選択し直してください。');
    }
    if (path.extname(filePath).toLowerCase() !== '.xlsx') {
      throw new Error('対応していないファイル形式です。.xlsx形式のエクセルファイルを選択してください。');
    }
    if (!(await fs.pathExists(filePath))) {
      throw new Error('指定されたファイルが見つかりません。ファイルが移動または削除された可能性があります。');
    }

    const apiKey = getDecryptedApiKey();
    if (!apiKey) throw new Error('APIキーが設定されていません。画面右上から設定してください。');

    let promptTemplate = store.get('custom-prompt');
    if (!promptTemplate) {
      const promptPath = path.join(rootDir, 'Prompt.md');
      if (!await fs.pathExists(promptPath)) throw new Error('Prompt.md が見つかりません。');
      promptTemplate = await fs.readFile(promptPath, 'utf-8');
    }
    const excelData = extractExcelData(filePath);

    const modelName = store.get('gemini-selected-model') || 'gemini-3.5-flash';

    // タイムアウト（10分）とユーザーキャンセルの両方をこのAbortControllerに集約する
    controller = new AbortController();
    activeGenerationController = controller;
    timeoutId = setTimeout(() => controller.abort('timeout'), GENERATION_TIMEOUT_MS);

    const rawMarkdown = await generateReport(apiKey, promptTemplate, excelData, campusName, modelName, controller.signal);

    // Gemini出力の決定的な後処理（正規化）と構造検証。再生成はせず、警告のみ返す。
    const { markdown, warnings } = processGeneratedReport(rawMarkdown);
    return { success: true, markdown, warnings };
  } catch (error) {
    console.error(error);
    // 文字列マッチではなくAbortSignal.reasonの構造化フラグでキャンセルを判定する。
    // タイムアウト（reason: 'timeout'）はキャンセル扱いにせず、エラーのまま返す。
    const cancelled = Boolean(controller && controller.signal.aborted && controller.signal.reason === 'user-cancelled');
    return { success: false, error: error.message, cancelled };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    activeGenerationController = null;
  }
});

// Cancel an in-flight Gemini generation request
ipcMain.handle('cancel-generation', () => {
  if (activeGenerationController) {
    activeGenerationController.abort('user-cancelled');
    return { success: true };
  }
  return { success: false };
});

// PDF Generation (Using Electron Native printToPDF)
// markdownはrenderer側で marked() -> DOMPurify.sanitize() 済みのHTMLとして渡される
// （プレビューとPDFの見た目を完全に一致させ、パイプラインを一本化するため）。
// mainはこのHTMLをテンプレートに埋め込むだけで、markedへの依存は持たない。
ipcMain.handle('generate-pdf', async (event, { htmlContent, padding }) => {
  const tempFilePath = path.join(app.getPath('temp'), `temp_print_${Date.now()}.html`);
  try {
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="${CSP_META_CONTENT}">
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

    // loadFileのPromiseは did-finish-load 完了時に解決される
    // （node_modules/electron/electron.d.ts の loadFile/loadURL のJSDoc参照）。
    await printWindow.loadFile(tempFilePath);

    // フォント読み込み完了を実際に待つ（固定時間待機ではなく document.fonts.ready を確認する）。
    // 万一 fonts.ready が長時間解決しない場合に備え、短い上限タイムアウトを保険として設ける。
    await Promise.race([
      printWindow.webContents.executeJavaScript('document.fonts.ready.then(() => {})'),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);

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
