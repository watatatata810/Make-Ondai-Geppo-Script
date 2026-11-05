import { useEffect, useState } from 'react';

/** Claude Code (サブスク) エンジンの選択肢。値は main.js の CLAUDE_MODEL_PREFIX と対応する。 */
export const CLAUDE_MODEL_OPTIONS = [
  { value: 'claude:sonnet', label: 'Claude Sonnet（サブスク）' },
  { value: 'claude:opus', label: 'Claude Opus（サブスク）' },
];

export const isClaudeModel = (model) => typeof model === 'string' && model.startsWith('claude:');

export function modelLabel(model) {
  const hit = CLAUDE_MODEL_OPTIONS.find(o => o.value === model);
  return hit ? hit.label : model;
}

/**
 * Gemini APIキー・Claude Code の有無と、利用可能モデル一覧の初期化・保存を管理するフック。
 * 起動時に保存済みAPIキーを検証し、成功時はStep2へ自動遷移する。
 * Gemini キーが無くても Claude Code (claude.exe) があれば、Claude を選んでStep2へ進める。
 */
export function useApiKeyModels({ setLoading, setStatus, setStep }) {
  const [apiKey, setApiKey] = useState('');
  const [geminiModels, setGeminiModels] = useState([]);
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');

  const availableModels = [
    ...(claudeAvailable ? CLAUDE_MODEL_OPTIONS.map(o => o.value) : []),
    ...geminiModels,
  ];

  useEffect(() => {
    if (!window.electronAPI) return;
    (async () => {
      let hasClaude = false;
      try {
        const claude = await window.electronAPI.checkClaude();
        hasClaude = Boolean(claude && claude.available);
        setClaudeAvailable(hasClaude);
      } catch (error) {
        console.error('Claude Code の確認に失敗しました:', error);
      }

      let models = [];
      let defaultModel = '';
      try {
        const key = await window.electronAPI.getApiKey();
        if (key) {
          setApiKey(key);
          try {
            const result = await window.electronAPI.getAvailableModels(key);
            models = result.allModels;
            defaultModel = result.defaultModel;
            setGeminiModels(models);
          } catch (error) {
            console.error('Initial API key validation failed:', error);
          }
        }
      } catch (error) {
        console.error('APIキーの取得に失敗しました:', error);
        setStatus({ type: 'error', message: '保存済みAPIキーの取得に失敗しました。' });
      }

      const savedModel = await window.electronAPI.getSelectedModel();
      const usable = [...(hasClaude ? CLAUDE_MODEL_OPTIONS.map(o => o.value) : []), ...models];
      if (usable.length === 0) return; // Step1 にとどまる

      const modelToSet = usable.includes(savedModel)
        ? savedModel
        : (defaultModel || usable[0]);
      setSelectedModel(modelToSet);
      if (modelToSet !== savedModel) await window.electronAPI.setSelectedModel(modelToSet);
      setStep(2);
    })();
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey) return;
    if (!window.electronAPI) return;
    setLoading(true);
    setStatus({ type: '', message: 'APIキーを検証中...' });

    try {
      const result = await window.electronAPI.getAvailableModels(apiKey);
      await window.electronAPI.setApiKey(apiKey);

      // 既存の選択モデルがあればそれを維持し、なければデフォルトをセット
      const savedModel = await window.electronAPI.getSelectedModel();
      const keep = savedModel && (result.allModels.includes(savedModel) || (claudeAvailable && isClaudeModel(savedModel)));
      const modelToSet = keep ? savedModel : result.defaultModel;

      await window.electronAPI.setSelectedModel(modelToSet);

      setGeminiModels(result.allModels);
      setSelectedModel(modelToSet);
      setStep(2);
      setStatus({ type: 'success', message: 'APIキーを検証し、モデル情報を取得しました。' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (error) {
      console.error('APIキーの検証に失敗しました:', error);
      setStatus({ type: 'error', message: 'APIキーが無効です。正しいキーを入力してください。' });
    } finally {
      setLoading(false);
    }
  };

  /** Gemini キーを使わず Claude Code (サブスク) だけで進む。 */
  const handleUseClaudeOnly = async () => {
    if (!window.electronAPI || !claudeAvailable) return;
    const model = CLAUDE_MODEL_OPTIONS[0].value;
    await window.electronAPI.setSelectedModel(model);
    setSelectedModel(model);
    setStep(2);
  };

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setSelectedModel(newModel);
    } catch (error) {
      console.error('モデル選択の保存に失敗しました:', error);
      setStatus({ type: 'error', message: 'モデル選択の保存に失敗しました。' });
    }
  };

  return {
    apiKey,
    setApiKey,
    availableModels,
    selectedModel,
    claudeAvailable,
    handleSaveApiKey,
    handleUseClaudeOnly,
    handleModelChange
  };
}
