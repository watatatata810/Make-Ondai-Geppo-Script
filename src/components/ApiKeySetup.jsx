/** Step1: Gemini APIキー入力画面。 */
function ApiKeySetup({ apiKey, setApiKey, onSaveApiKey }) {
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
    </div>
  );
}

export default ApiKeySetup;
