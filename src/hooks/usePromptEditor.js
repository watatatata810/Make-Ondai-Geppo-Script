import { useState } from 'react';

/** AIプロンプトの確認・編集モーダルの状態と、読み込み/保存/リセット操作を管理するフック。 */
export function usePromptEditor({ setLoading, setStatus }) {
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);

  const handleOpenPromptEditor = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.getPrompt();
      setPromptText(result.text);
      setIsCustomPrompt(result.isCustom);
      setIsPromptModalOpen(true);
    } catch (err) {
      console.error('プロンプトの読み込みに失敗しました:', err);
      setStatus({ type: 'error', message: 'プロンプトの読み込みに失敗しました。' });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!window.electronAPI) return;
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
      console.error('プロンプトの保存中にエラーが発生しました:', err);
      setStatus({ type: 'error', message: 'プロンプトの保存中にエラーが発生しました。' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPrompt = async () => {
    if (!window.electronAPI) return;
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
      console.error('プロンプトのリセット中にエラーが発生しました:', err);
      setStatus({ type: 'error', message: 'プロンプトのリセット中にエラーが発生しました。' });
    } finally {
      setLoading(false);
    }
  };

  return {
    isPromptModalOpen,
    setIsPromptModalOpen,
    promptText,
    setPromptText,
    isCustomPrompt,
    handleOpenPromptEditor,
    handleSavePrompt,
    handleResetPrompt
  };
}
