/** AIプロンプトの確認・編集モーダル。 */
function PromptModal({
  isOpen,
  promptText,
  setPromptText,
  isCustomPrompt,
  loading,
  onSave,
  onCancel,
  onReset
}) {
  if (!isOpen) return null;

  return (
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
            onClick={onReset}
            disabled={loading}
          >
            デフォルトに戻す
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn"
              onClick={onCancel}
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              className="btn primary-btn"
              onClick={onSave}
              disabled={loading}
            >
              保存して適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PromptModal;
