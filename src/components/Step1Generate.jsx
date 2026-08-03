import { CAMPUS_OPTIONS } from '../campusUtils';

/**
 * Step2: エクセルファイルの選択/D&D、モデル選択、キャンパス手動選択、
 * プロンプト編集モーダル起動、生成/キャンセルボタン、作成済み履歴一覧。
 */
function Step1Generate({
  selectedModel,
  availableModels,
  onModelChange,
  onOpenPromptEditor,
  onResetApiKey,
  fileInfo,
  manualCampus,
  setManualCampus,
  loading,
  onFileSelect,
  onDrop,
  onDragOver,
  onCancelFile,
  resolvedCampusName,
  onCancelGeneration,
  onExecuteGeneration,
  reportHistory,
  onSelectHistoryItem,
  onDeleteHistoryItem
}) {
  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="label" style={{ margin: 0 }}>2. エクセルファイルの選択</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>モデル:</span>
          <select
            value={selectedModel}
            onChange={onModelChange}
            className="input-field"
            style={{ padding: '8px 32px 8px 16px', appearance: 'auto' }}
          >
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button className="btn" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={onOpenPromptEditor}>プロンプト確認・編集</button>
          <button className="btn-text" onClick={onResetApiKey}>APIキーを再設定</button>
        </div>
      </div>

      <div className="step2-grid">
        <div className="step2-left">
          {!fileInfo ? (
            <div
              className="drop-zone"
              onDrop={onDrop}
              onDragOver={onDragOver}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', marginBottom: '16px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>ここにエクセルファイルをドラッグ＆ドロップ</p>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>または</p>
              <button className="btn" onClick={onFileSelect} disabled={loading}>
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

              {fileInfo.campusName ? (
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>対象キャンパス: {fileInfo.campusName}</p>
              ) : (
                <div style={{ marginBottom: '32px' }}>
                  <p style={{ color: 'var(--warning)', fontWeight: 700, marginBottom: '12px' }}>
                    ファイル名からキャンパスを自動判別できませんでした。対象キャンパスを選択してください。
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                    {CAMPUS_OPTIONS.map(option => (
                      <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-base)' }}>
                        <input
                          type="radio"
                          name="manual-campus"
                          value={option}
                          checked={manualCampus === option}
                          onChange={(e) => setManualCampus(e.target.value)}
                          disabled={loading}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <button className="btn" onClick={onCancelFile} disabled={loading}>キャンセル</button>
                {loading ? (
                  <button className="btn btn-danger" onClick={onCancelGeneration} style={{ padding: '12px 32px' }}>
                    生成をキャンセル
                  </button>
                ) : (
                  <button
                    className="btn primary-btn"
                    onClick={onExecuteGeneration}
                    disabled={loading || !resolvedCampusName}
                    style={{ padding: '12px 32px' }}
                  >
                    AIで月報を生成する
                  </button>
                )}
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
                  onClick={() => onSelectHistoryItem(item)}
                >
                  <div className="history-info">
                    <span className="history-campus">{item.campusName}</span>
                    <span className="history-filename" title={item.filename}>{item.filename}</span>
                    <span className="history-date">作成: {item.createdAt}</span>
                  </div>
                  <div className="history-actions">
                    <button
                      className="btn-delete"
                      onClick={(e) => onDeleteHistoryItem(e, item.id)}
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
  );
}

export default Step1Generate;
