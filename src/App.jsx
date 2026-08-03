import { useState } from 'react';
import { detectCampus } from './campusUtils';
import { markdownToSafeHtml } from './markdownUtils';
import { useApiKeyModels } from './hooks/useApiKeyModels';
import { useReportHistory } from './hooks/useReportHistory';
import { usePromptEditor } from './hooks/usePromptEditor';
import ApiKeySetup from './components/ApiKeySetup';
import Step1Generate from './components/Step1Generate';
import EditorPreview from './components/EditorPreview';
import PromptModal from './components/PromptModal';

function App() {
  const [step, setStep] = useState(1); // 1: Settings, 2: Upload, 3: Edit & Preview

  const [fileInfo, setFileInfo] = useState(null);
  const [manualCampus, setManualCampus] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [padding, setPadding] = useState(40);
  const [reportWarnings, setReportWarnings] = useState([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const {
    apiKey,
    setApiKey,
    availableModels,
    selectedModel,
    handleSaveApiKey,
    handleModelChange
  } = useApiKeyModels({ setLoading, setStatus, setStep });

  const {
    reportHistory,
    setReportHistory,
    activeReportId,
    setActiveReportId
  } = useReportHistory({ markdownContent, padding, setStatus });

  const {
    isPromptModalOpen,
    setIsPromptModalOpen,
    promptText,
    setPromptText,
    isCustomPrompt,
    handleOpenPromptEditor,
    handleSavePrompt,
    handleResetPrompt
  } = usePromptEditor({ setLoading, setStatus });

  const handleSelectHistoryItem = (item) => {
    setActiveReportId(item.id);
    setMarkdownContent(item.markdownContent);
    setPadding(item.padding || 40);
    setReportWarnings([]);
    setFileInfo({
      filename: item.filename,
      filePath: item.filePath,
      campusName: item.campusName
    });
    setManualCampus('');
    setStep(3);
  };

  const handleDeleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    if (!confirm('この月報データを履歴リストから削除しますか？')) return;
    const newHistory = reportHistory.filter(item => item.id !== id);
    setReportHistory(newHistory);
    if (window.electronAPI) {
      try {
        await window.electronAPI.saveHistory(newHistory);
      } catch (error) {
        console.error('履歴の削除保存に失敗しました:', error);
        setStatus({ type: 'error', message: '履歴の削除に失敗しました。' });
      }
    }
    if (activeReportId === id) {
      setActiveReportId(null);
      setFileInfo(null);
      setMarkdownContent('');
    }
  };

  const handleFileSelect = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.selectExcelFile();
      if (result) {
        setManualCampus('');
        setFileInfo({ ...result, campusName: detectCampus(result.filename) });
      }
    } catch (error) {
      console.error('ファイル選択に失敗しました:', error);
      setStatus({ type: 'error', message: 'ファイル選択に失敗しました。' });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx')) {
        // Electron 32以降 File.path は廃止されたため、preload経由でwebUtils.getPathForFileを使う
        const filePath = window.electronAPI ? window.electronAPI.getPathForFile(file) : '';
        setManualCampus('');
        setFileInfo({ filePath, filename: file.name, campusName: detectCampus(file.name) });
      } else {
        setStatus({ type: 'error', message: 'Excelファイル(.xlsx)をドロップしてください。' });
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const resolvedCampusName = fileInfo?.campusName || manualCampus || '';

  const executeGeneration = async () => {
    if (!fileInfo) return;
    if (!resolvedCampusName) return; // 未判定・未選択の場合は生成しない（ボタン側でも無効化済み）
    if (!window.electronAPI) return;

    setLoading(true);
    setStatus({ type: '', message: 'Gemini AI が月報を生成中です...（最大10分。長時間かかる場合はキャンセルできます）' });

    try {
      const result = await window.electronAPI.generateMarkdown(fileInfo.filePath, resolvedCampusName);
      if (result.success) {
        setMarkdownContent(result.markdown);
        setPadding(40);
        setReportWarnings(result.warnings || []);

        // 履歴オブジェクトを作成して保存
        const now = new Date();
        const formattedDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const newReport = {
          id: Date.now().toString(),
          filename: fileInfo.filename,
          filePath: fileInfo.filePath,
          campusName: resolvedCampusName,
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
      } else if (result.cancelled) {
        setStatus({ type: '', message: 'キャンセルしました' });
      } else {
        setStatus({ type: 'error', message: `生成エラー: ${result.error}` });
      }
    } catch (error) {
      console.error('月報生成中に予期しないエラーが発生しました:', error);
      setStatus({ type: 'error', message: `月報生成中に予期しないエラーが発生しました: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGeneration = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.cancelGeneration();
    } catch (error) {
      console.error('キャンセル要求の送信に失敗しました:', error);
    }
  };

  const handleGeneratePdf = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setStatus({ type: '', message: 'PDFを生成中...' });

    try {
      // プレビューと完全に同一のサニタイズ済みHTMLをPDFパイプラインへ渡す
      const htmlContent = markdownToSafeHtml(markdownContent);
      const genResult = await window.electronAPI.generatePdf(htmlContent, padding);
      if (genResult.success) {
        const yearMonthMatch = fileInfo.filename.match(/(\d{4}年\d{1,2}月)/);
        const yearMonth = yearMonthMatch ? yearMonthMatch[1] + '_' : '';
        const defaultName = `${yearMonth}${resolvedCampusName}_ホール業務実施報告書.pdf`;
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
    } catch (error) {
      console.error('PDF生成中に予期しないエラーが発生しました:', error);
      setStatus({ type: 'error', message: `PDF生成中に予期しないエラーが発生しました: ${error.message}` });
    } finally {
      setLoading(false);
    }
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
        <ApiKeySetup apiKey={apiKey} setApiKey={setApiKey} onSaveApiKey={handleSaveApiKey} />
      )}

      {step === 2 && (
        <Step1Generate
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={handleModelChange}
          onOpenPromptEditor={handleOpenPromptEditor}
          onResetApiKey={() => setStep(1)}
          fileInfo={fileInfo}
          manualCampus={manualCampus}
          setManualCampus={setManualCampus}
          loading={loading}
          onFileSelect={handleFileSelect}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onCancelFile={() => { setFileInfo(null); setManualCampus(''); }}
          resolvedCampusName={resolvedCampusName}
          onCancelGeneration={handleCancelGeneration}
          onExecuteGeneration={executeGeneration}
          reportHistory={reportHistory}
          onSelectHistoryItem={handleSelectHistoryItem}
          onDeleteHistoryItem={handleDeleteHistoryItem}
        />
      )}

      {step === 3 && (
        <EditorPreview
          fileInfo={fileInfo}
          padding={padding}
          setPadding={setPadding}
          onBackToStep2={() => { setStep(2); setFileInfo(null); setManualCampus(''); }}
          reportWarnings={reportWarnings}
          onDismissWarnings={() => setReportWarnings([])}
          markdownContent={markdownContent}
          setMarkdownContent={setMarkdownContent}
          loading={loading}
          onGeneratePdf={handleGeneratePdf}
        />
      )}

      <PromptModal
        isOpen={isPromptModalOpen}
        promptText={promptText}
        setPromptText={setPromptText}
        isCustomPrompt={isCustomPrompt}
        loading={loading}
        onSave={handleSavePrompt}
        onCancel={() => setIsPromptModalOpen(false)}
        onReset={handleResetPrompt}
      />
    </div>
  );
}

export default App;
