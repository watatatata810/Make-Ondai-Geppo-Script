/** Step1: Gemini APIキー入力画面。Claude Code があれば、キー無しで Claude だけを使う選択肢も出す。 */
function ApiKeySetup({ apiKey, setApiKey, onSaveApiKey, claudeAvailable, onUseClaudeOnly }) {
  return (
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
        <button className="btn primary-btn" onClick={onSaveApiKey}>保存して次へ</button>
      </div>
      {claudeAvailable && (
        <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn" onClick={onUseClaudeOnly}>Gemini を使わず Claude（サブスク）で進む</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            このPCの Claude Code のログインを使います（API キー不要）。
          </span>
        </div>
      )}
    </div>
  );
}

export default ApiKeySetup;
