import { useEffect, useState } from 'react';

/**
 * Gemini APIキーと利用可能モデル一覧の初期化・保存を管理するフック。
 * 初回起動時に保存済みAPIキーを検証し、成功時はStep2へ自動遷移する。
 */
export function useApiKeyModels({ setLoading, setStatus, setStep }) {
  const [apiKey, setApiKey] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');

  useEffect(() => {
    // 初回起動時にAPIキーを取得して検証
    if (!window.electronAPI) return;
    (async () => {
      try {
        const key = await window.electronAPI.getApiKey();
        if (!key) return;
        setApiKey(key);
        try {
          const result = await window.electronAPI.getAvailableModels(key);
          setAvailableModels(result.allModels);
          const savedModel = await window.electronAPI.getSelectedModel();
          setSelectedModel(savedModel || result.defaultModel);
          setStep(2);
        } catch (error) {
          console.error('Initial API key validation failed:', error);
          // 無効なキーの場合はStep 1にとどまる
        }
      } catch (error) {
        console.error('APIキーの取得に失敗しました:', error);
        setStatus({ type: 'error', message: '保存済みAPIキーの取得に失敗しました。' });
      }
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
      const modelToSet = savedModel && result.allModels.includes(savedModel) ? savedModel : result.defaultModel;

      await window.electronAPI.setSelectedModel(modelToSet);

      setAvailableModels(result.allModels);
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
    handleSaveApiKey,
    handleModelChange
  };
}
