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

/**
 * PDF 保存時の既定ファイル名。共有ドライブ「日報・月報」の既存の月報と同じ
 * `YYYY年MM月_<キャンパス名>_ホール業務実施報告書.pdf` にそろえる（月は 2 桁）。
 * 年月は日報のファイル名から取り、無ければ月報 Markdown のタイトル行から取る。
 * キャンパス名が無ければ月報のタイトル行の（）内から取る。
 *
 * @param {string} excelFilename 日報のファイル名
 * @param {string} markdown 月報の Markdown
 * @param {string} campusName 判別済みのキャンパス名（空でもよい）
 * @returns {string}
 */
export function buildPdfFileName(excelFilename, markdown, campusName) {
  const title = (typeof markdown === 'string' ? markdown : '').split('\n').find(l => /^#\s/.test(l)) || '';
  const ym = String(excelFilename || '').match(/(\d{4})年(\d{1,2})月/) || title.match(/(\d{4})年(\d{1,2})月/);
  const yearMonth = ym ? `${ym[1]}年${ym[2].padStart(2, '0')}月_` : '';
  const campus = campusName || detectCampus(title) || '';
  return `${yearMonth}${campus ? campus + '_' : ''}ホール業務実施報告書.pdf`;
}
