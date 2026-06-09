import { useState, useEffect } from 'react';
import { marked } from 'marked';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState(1); // 1: Settings, 2: Upload, 3: Edit & Preview

  const [fileInfo, setFileInfo] = useState(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [padding, setPadding] = useState(40);

  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);

  const [reportHistory, setReportHistory] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);

  // 履歴データのロード
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getHistory().then(history => {
        setReportHistory(history || []);
      });
    }
  }, []);

  // 履歴の自動保存（500msのデバウンス）
  useEffect(() => {
    if (!window.electronAPI) return;
    const timer = setTimeout(() => {
      window.electronAPI.saveHistory(reportHistory);
    }, 500);
    return () => clearTimeout(timer);
  }, [reportHistory]);

  // 編集中の内容を自動的に履歴配列へ書き戻す
  useEffect(() => {
    if (activeReportId) {
      setReportHistory(prevHistory => {
        const index = prevHistory.findIndex(item => item.id === activeReportId);
        if (index !== -1 && (prevHistory[index].markdownContent !== markdownContent || prevHistory[index].padding !== padding)) {
          const updated = [...prevHistory];
          updated[index] = {
            ...updated[index],
            markdownContent,
            padding
          };
          return updated;
        }
        return prevHistory;
      });
    }
  }, [markdownContent, padding, activeReportId]);

  useEffect(() => {
    // 初回起動時にAPIキーを取得して検証
    if (window.electronAPI) {
      window.electronAPI.getApiKey().then(async key => {
        if (key) {
          setApiKey(key);
          try {
            const result = await window.electronAPI.getAvailableModels(key);
            setAvailableModels(result.allModels);
            const savedModel = await window.electronAPI.getSelectedModel();
            setSelectedModel(savedModel || result.defaultModel);
            setStep(2);
          } catch (error) {
            console.error("Initial API key validation failed:", error);
            // 無効なキーの場合はStep 1にとどまる
          }
        }
      });
    }
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey) return;
    setLoading(true);
    setStatus({ type: '', message: 'APIキーを検証中...' });

    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.getAvailableModels(apiKey);
        await window.electronAPI.setApiKey(apiKey);

        // 既存の選択モデルがあればそれを維持し、なければデフォルトをセット
        const savedModel = await window.electronAPI.getSelectedModel();
        const modelToSet = savedModel && result.allModels.includes(savedModel) ? savedModel : result.defaultModel;

        await window.electronAPI.setSelectedModel(modelToSet);

        setAvailableModels(result.allModels);
        setSelectedModel(modelToSet);
        setStep(2);
        setStatus({ type: 'success', message: 'APIキーを検証し、モデル情報を取得しました。' });
        setTimeout(() => setStatus({ type: '', message: '' }), 3000);
      } catch (error) {
        setStatus({ type: 'error', message: 'APIキーが無効です。正しいキーを入力してください。' });
      }
    }
    setLoading(false);
  };

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    if (window.electronAPI) {
      await window.electronAPI.setSelectedModel(newModel);
    }
  };

  const handleOpenPromptEditor = async () => {
    if (window.electronAPI) {
      setLoading(true);
      try {
        const result = await window.electronAPI.getPrompt();
        setPromptText(result.text);
        setIsCustomPrompt(result.isCustom);
        setIsPromptModalOpen(true);
      } catch (err) {
        setStatus({ type: 'error', message: 'プロンプトの読み込みに失敗しました。' });
      }
      setLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (window.electronAPI) {
      setLoading(true);
      try {
        const result = await window.electronAPI.savePrompt(promptText);
        if (result.success) {
          setIsCustomPrompt(result.isCustom);
          setIsPromptModalOpen(false);
          setStatus({ type: 'success', message: 'プロンプトを保存して適用しました。' });
          setTimeout(() => setStatus({ type: '', message: '' }), 3000);
        } else {
          setStatus({ type: 'error', message: 'プロンプトの保存に失敗しました。' });
        }
      } catch (err) {
        setStatus({ type: 'error', message: 'プロンプトの保存中にエラーが発生しました。' });
      }
      setLoading(false);
    }
  };

  const handleResetPrompt = async () => {
    if (window.electronAPI) {
      if (!confirm('プロンプトをオリジナルのデフォルト状態に戻しますか？')) return;
      setLoading(true);
      try {
        const result = await window.electronAPI.resetPrompt();
        if (result.success) {
          setPromptText(result.text);
          setIsCustomPrompt(false);
          setStatus({ type: 'success', message: 'デフォルトのプロンプトに戻しました。' });
          setTimeout(() => setStatus({ type: '', message: '' }), 3000);
        } else {
          setStatus({ type: 'error', message: 'プロンプトのリセットに失敗しました。' });
        }
      } catch (err) {
        setStatus({ type: 'error', message: 'プロンプトのリセット中にエラーが発生しました。' });
      }
      setLoading(false);
    }
  };

  const handleSelectHistoryItem = (item) => {
    setActiveReportId(item.id);
    setMarkdownContent(item.markdownContent);
    setPadding(item.padding || 40);
    setFileInfo({
      filename: item.filename,
      filePath: item.filePath,
      campusName: item.campusName
    });
    setStep(3);
  };

  const handleDeleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    if (!confirm('この月報データを履歴リストから削除しますか？')) return;
    const newHistory = reportHistory.filter(item => item.id !== id);
    setReportHistory(newHistory);
    if (window.electronAPI) {
      await window.electronAPI.saveHistory(newHistory);
    }
    if (activeReportId === id) {
      setActiveReportId(null);
      setFileInfo(null);
      setMarkdownContent('');
    }
  };

  const handleFileSelect = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.selectExcelFile();
      if (result) {
        setFileInfo(result);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        let campusName = "不明なキャンパス";
        if (file.name.includes("池袋")) campusName = "池袋キャンパス";
        else if (file.name.includes("中目黒")) campusName = "中目黒キャンパス";

        setFileInfo({ filePath: file.path, filename: file.name, campusName });
      } else {
        setStatus({ type: 'error', message: 'Excelファイル(.xlsx)をドロップしてください。' });
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const executeGeneration = async () => {
    if (!fileInfo) return;
    setLoading(true);
    setStatus({ type: '', message: 'Gemini AI が月報を生成中です...（2分〜4分かかります）' });

    if (window.electronAPI) {
      const result = await window.electronAPI.generateMarkdown(fileInfo.filePath, fileInfo.campusName);
      if (result.success) {
        setMarkdownContent(result.markdown);
        setPadding(40);

        // 履歴オブジェクトを作成して保存
        const now = new Date();
        const formattedDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const newReport = {
          id: Date.now().toString(),
          filename: fileInfo.filename,
          filePath: fileInfo.filePath,
          campusName: fileInfo.campusName,
          markdownContent: result.markdown,
          padding: 40,
          createdAt: formattedDate
        };

        const newHistory = [newReport, ...reportHistory];
        setReportHistory(newHistory);
        await window.electronAPI.saveHistory(newHistory);
        setActiveReportId(newReport.id);

        setStep(3);
        setStatus({ type: '', message: '' });
      } else {
        setStatus({ type: 'error', message: `生成エラー: ${result.error}` });
      }
    }
    setLoading(false);
  };

  const handleGeneratePdf = async () => {
    setLoading(true);
    setStatus({ type: '', message: 'PDFを生成中...' });

    if (window.electronAPI) {
      // 1. Generate PDF Buffer
      const genResult = await window.electronAPI.generatePdf(markdownContent, padding);
      if (genResult.success) {
        // 2. Save PDF
        const defaultName = fileInfo.filename.replace('.xlsx', '_月報.pdf');
        const saveResult = await window.electronAPI.savePdf(genResult.pdfBuffer, defaultName);

        if (saveResult.success) {
          setStatus({ type: 'success', message: `保存しました: ${saveResult.path}` });
        } else if (saveResult.canceled) {
          setStatus({ type: '', message: '' }); // キャンセル時
        } else {
          setStatus({ type: 'error', message: '保存に失敗しました。' });
        }
      } else {
        setStatus({ type: 'error', message: `PDF生成エラー: ${genResult.error}` });
      }
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>ホール業務月報ジェネレーター</h1>
        <div className="steps-indicator">
          <span className={step >= 1 ? 'active' : ''}>1. 設定</span>
          <svg className="step-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span className={step >= 2 ? 'active' : ''}>2. ファイル入力</span>
          <svg className="step-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span className={step >= 3 ? 'active' : ''}>3. 編集＆出力</span>
        </div>
      </div>

      {status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}

      {step === 1 && (
        <div className="section card">
          <h2 className="label">1. Gemini APIキーの設定</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
            AIを使用するためのAPIキーを入力してください。<br />
            取得はこちら: <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a>
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="input-field"
              style={{ flex: 1 }}
            />
            <button className="btn primary-btn" onClick={handleSaveApiKey}>保存して次へ</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className="label" style={{ margin: 0 }}>2. エクセルファイルの選択</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>モデル:</span>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                className="input-field"
                style={{ padding: '8px 32px 8px 16px', appearance: 'auto' }}
              >
                {availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button className="btn" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleOpenPromptEditor}>プロンプト確認・編集</button>
              <button className="btn-text" onClick={() => setStep(1)}>APIキーを再設定</button>
            </div>
          </div>

          <div className="step2-grid">
            <div className="step2-left">
              {!fileInfo ? (
                <div
                  className="drop-zone"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', marginBottom: '16px' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                  <p style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>ここにエクセルファイルをドラッグ＆ドロップ</p>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>または</p>
                  <button className="btn" onClick={handleFileSelect} disabled={loading}>
                    ファイルを選択する...
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--interactive-bg)', borderRadius: '8px', boxShadow: 'rgba(0, 0, 0, 0.3) 0px 8px 16px' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <p style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '8px' }}>読み込み完了: {fileInfo.filename}</p>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>対象キャンパス: {fileInfo.campusName}</p>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                    <button className="btn" onClick={() => setFileInfo(null)} disabled={loading}>キャンセル</button>
                    <button className="btn primary-btn" onClick={executeGeneration} disabled={loading} style={{ padding: '12px 32px' }}>
                      {loading ? '処理中...' : 'AIで月報を生成する'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="step2-right">
              <h3 className="history-title">作成済みの月報 (履歴)</h3>
              <div className="history-list">
                {reportHistory.length === 0 ? (
                  <div className="history-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>作成済みの月報はありません。<br />新規にファイルを読み込んで生成してください。</span>
                  </div>
                ) : (
                  reportHistory.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleSelectHistoryItem(item)}
                    >
                      <div className="history-info">
                        <span className="history-campus">{item.campusName}</span>
                        <span className="history-filename" title={item.filename}>{item.filename}</span>
                        <span className="history-date">作成: {item.createdAt}</span>
                      </div>
                      <div className="history-actions">
                        <button
                          className="btn-delete"
                          onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                          title="削除"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="editor-section">
          <div className="editor-header">
            <div>
              <h2 className="label" style={{ margin: 0 }}>3. Markdown編集 & プレビュー</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>対象: {fileInfo?.filename}</p>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div className="slider-group">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>余白:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={padding}
                  onChange={(e) => setPadding(parseInt(e.target.value))}
                />
                <span style={{ fontSize: '0.85rem', width: '30px' }}>{padding}px</span>
              </div>
              <button className="btn-text" onClick={() => { setStep(2); setFileInfo(null); }}>別のファイルを選ぶ</button>
            </div>
          </div>

          <div className="split-view">
            <div className="editor-pane">
              <div className="pane-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                </svg>
                <span>マークダウン編集エリア（編集結果がプレビューに即時反映されます）</span>
              </div>
              <textarea
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                className="markdown-textarea"
                spellCheck="false"
              />
            </div>
            <div className="preview-pane">
              <div className="pane-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M6 9V2h12v7"></path>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>印刷プレビュー (A4想定)</span>
              </div>
              <div className="preview-container">
                <div
                  className="markdown-body"
                  style={{ padding: `${padding}px` }}
                  dangerouslySetInnerHTML={{ __html: marked(markdownContent) }}
                />
              </div>
            </div>
          </div>

          <div className="footer-actions">
            <button
              className="btn primary-btn"
              onClick={handleGeneratePdf}
              disabled={loading}
              style={{ width: '100%', padding: '20px', fontSize: '1.2rem' }}
            >
              {loading ? '処理中...' : 'PDFとして保存する'}
            </button>
          </div>
        </div>
      )}

      {isPromptModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h3 className="label" style={{ margin: 0 }}>AIプロンプトの確認・編集</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Geminiに渡す指示内容です。変更は次回以降の実行にも引き継がれます。
                </p>
              </div>
              {isCustomPrompt && (
                <span style={{ fontSize: '0.8rem', background: 'rgba(30, 215, 96, 0.15)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '9999px', fontWeight: 700 }}>
                  カスタム適用中
                </span>
              )}
            </div>

            <div className="modal-body">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="prompt-textarea"
                spellCheck="false"
                placeholder="プロンプトを入力してください..."
              />
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-danger"
                onClick={handleResetPrompt}
                disabled={loading}
              >
                デフォルトに戻す
              </button>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn"
                  onClick={() => setIsPromptModalOpen(false)}
                  disabled={loading}
                >
                  キャンセル
                </button>
                <button
                  className="btn primary-btn"
                  onClick={handleSavePrompt}
                  disabled={loading}
                >
                  保存して適用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
