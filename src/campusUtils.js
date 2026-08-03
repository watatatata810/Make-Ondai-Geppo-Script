/**
 * ファイル名からキャンパス名を判別する。
 * main.js（ダイアログ経由）とApp.jsx（ドラッグ&ドロップ経由）で重複していた判定ロジックを
 * ここに一本化する。判定できない場合はnullを返し、呼び出し側で手動選択を促す。
 *
 * @param {string} filename
 * @returns {'池袋キャンパス' | '中目黒キャンパス' | null}
 */
export function detectCampus(filename) {
  if (typeof filename !== 'string') return null;
  if (filename.includes('池袋')) return '池袋キャンパス';
  if (filename.includes('中目黒')) return '中目黒キャンパス';
  return null;
}

export const CAMPUS_OPTIONS = ['池袋キャンパス', '中目黒キャンパス'];
