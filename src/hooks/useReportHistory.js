import { useEffect, useState } from 'react';

/**
 * 月報履歴のロード/自動保存（500msデバウンス）/アクティブ編集内容の書き戻しを管理するフック。
 * markdownContent/padding はApp側で編集される値をそのまま渡してもらい、
 * アクティブな履歴アイテムへの反映のみをここで行う。
 */
export function useReportHistory({ markdownContent, padding, setStatus }) {
  const [reportHistory, setReportHistory] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);

  // 履歴データのロード
  useEffect(() => {
    if (!window.electronAPI) return;
    (async () => {
      try {
        const history = await window.electronAPI.getHistory();
        setReportHistory(history || []);
      } catch (error) {
        console.error('履歴の読み込みに失敗しました:', error);
        setStatus({ type: 'error', message: '履歴の読み込みに失敗しました。' });
      }
    })();
  }, []);

  // 履歴の自動保存（500msのデバウンス）
  useEffect(() => {
    if (!window.electronAPI) return;
    const timer = setTimeout(async () => {
      try {
        await window.electronAPI.saveHistory(reportHistory);
      } catch (error) {
        console.error('履歴の自動保存に失敗しました:', error);
        setStatus({ type: 'error', message: '履歴の自動保存に失敗しました。' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [reportHistory]);

  // 編集中の内容を自動的に履歴配列へ書き戻す
  useEffect(() => {
    if (activeReportId) {
      setReportHistory(prevHistory => {
        const index = prevHistory.findIndex(item => item.id === activeReportId);
        if (index !== -1 && (prevHistory[index].markdownContent !== markdownContent || prevHistory[index].padding !== padding)) {
          const updated = [...prevHistory];
          updated[index] = {
            ...updated[index],
            markdownContent,
            padding
          };
          return updated;
        }
        return prevHistory;
      });
    }
  }, [markdownContent, padding, activeReportId]);

  return {
    reportHistory,
    setReportHistory,
    activeReportId,
    setActiveReportId
  };
}
