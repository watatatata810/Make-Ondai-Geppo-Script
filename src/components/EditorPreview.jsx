import { markdownToSafeHtml } from '../markdownUtils';

/** Step3: Markdown編集エリア・印刷プレビュー・余白スライダー・警告バナー・PDF出力ボタン。 */
function EditorPreview({
  fileInfo,
  padding,
  setPadding,
  onBackToStep2,
  reportWarnings,
  onDismissWarnings,
  markdownContent,
  setMarkdownContent,
  loading,
  onGeneratePdf
}) {
  return (
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
          <button className="btn-text" onClick={onBackToStep2}>別のファイルを選ぶ</button>
        </div>
      </div>

      {reportWarnings.length > 0 && (
        <div className="status warning" style={{ margin: '16px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div style={{ marginBottom: '6px' }}>生成結果に、期待するフォーマットとの差異が見つかりました（内容は自動修正されていません。必要に応じて編集エリアで確認してください）:</div>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {reportWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
          <button
            className="btn-text"
            style={{ flexShrink: 0 }}
            onClick={onDismissWarnings}
            title="閉じる"
          >
            ×
          </button>
        </div>
      )}

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
              dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(markdownContent) }}
            />
          </div>
        </div>
      </div>

      <div className="footer-actions">
        <button
          className="btn primary-btn"
          onClick={onGeneratePdf}
          disabled={loading}
          style={{ width: '100%', padding: '20px', fontSize: '1.2rem' }}
        >
          {loading ? '処理中...' : 'PDFとして保存する'}
        </button>
      </div>
    </div>
  );
}

export default EditorPreview;
