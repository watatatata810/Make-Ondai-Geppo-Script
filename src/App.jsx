import { useState, useEffect } from 'react'

function App() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [padding, setPadding] = useState(40)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files')
      const data = await response.json()
      setFiles(data)
    } catch (error) {
      console.error('Failed to fetch files:', error)
    }
  }

  const handleConvert = async () => {
    if (!selectedFile) return

    setLoading(true)
    setStatus({ type: '', message: '' })

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile, padding })
      })

      const data = await response.json()

      if (data.success) {
        setStatus({ type: 'success', message: `変換成功: ${selectedFile.replace('.md', '.pdf')}` })
      } else {
        setStatus({ type: 'error', message: `エラー: ${data.error}` })
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'サーバーとの通信に失敗しました。' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Markdown to PDF</h1>
      <p className="subtitle">余白を調整した、改ページなしのPDFを生成します</p>

      <div className="section">
        <span className="label">1. ファイルを選択</span>
        {files.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Markdownファイルが見つかりません</p>
        ) : (
          <div className="file-grid">
            {files.map(file => (
              <div
                key={file}
                className={`file-card ${selectedFile === file ? 'selected' : ''}`}
                onClick={() => setSelectedFile(file)}
              >
                <div className="file-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div className="file-info">
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{file}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <span className="label">2. 余白を調整 (Padding)</span>
        <div className="controls">
          <div className="slider-group">
            <input
              type="range"
              min="0"
              max="100"
              value={padding}
              onChange={(e) => setPadding(parseInt(e.target.value))}
            />
            <span style={{ minWidth: '40px', fontWeight: 600 }}>{padding}px</span>
          </div>
        </div>
      </div>

      <button
        className="btn"
        onClick={handleConvert}
        disabled={!selectedFile || loading}
      >
        {loading ? (
          <>
            <svg className="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            生成中...
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            PDFを生成
          </>
        )}
      </button>

      {status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  )
}

export default App
