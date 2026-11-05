import * as XLSX from 'xlsx';
import fs from 'fs';

/**
 * 2桁ゼロ埋めのヘルパー。
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 日付/時刻書式のセルのシリアル値を、決定的な文字列表現に変換する（v1.1.x の Date 経由の方式と同じ出力）。
 *
 * - 時刻のみ（シリアル値 < 2、つまり 1899 年扱い）→ "HH:MM"
 * - 日付のみ → "YYYY/MM/DD"
 * - 日付+時刻 → "YYYY/MM/DD HH:MM"
 * 分単位に四捨五入する。Date を経由しないため実行環境のタイムゾーンに依存しない
 * （Date 経由の方式は、Playwright から起動したこのアプリで時刻が 9 時間ずれた。2026-11-06）。
 *
 * @param {number} serial
 * @returns {string}
 */
export function formatExcelSerialCell(serial) {
  const isTimeOnly = serial < 2; // 0 = 1899-12-30, 1 = 1899-12-31
  const totalMinutes = Math.round(serial * 1440);
  const dayPart = Math.floor(totalMinutes / 1440);
  const minutes = totalMinutes - dayPart * 1440;
  const hh = pad2(Math.floor(minutes / 60));
  const mm = pad2(minutes % 60);
  if (isTimeOnly) return `${hh}:${mm}`;

  const d = XLSX.SSF.parse_date_code(dayPart);
  const ymd = `${d.y}/${pad2(d.m)}/${pad2(d.d)}`;
  return minutes !== 0 ? `${ymd} ${hh}:${mm}` : ymd;
}

/**
 * Excelファイルから全てのシートのデータを抽出し、
 * Python版と同様にCSV風のテキスト形式に変換します。
 *
 * @param {string} filePath Excelファイルのパス
 * @returns {string} 結合されたテキストデータ
 */
export function extractExcelData(filePath) {
  console.log(`Extracting data from: ${filePath}`);
  const combinedText = [];

  // Excelファイルをバッファとして読み込む
  const fileBuffer = fs.readFileSync(filePath);
  // 日付/時刻セルは JS の Date を経由せず、シリアル値（数値）と書式から直接文字列にする
  // （formatExcelSerialCell 参照）。cellNF:true で各セルの表示書式 (cell.z) を取得する。
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: false, cellNF: true });

  // すべてのシートを処理
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet['!ref']) {
      combinedText.push(`--- SHEET: ${sheetName} ---\n\n`);
      continue;
    }

    // sheet_to_json({ header: 1, defval: "" }) と同じ範囲・並びで、空のセルも保持して二次元に並べる
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const csvRows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined || cell.v === null) {
          row.push('');
        } else if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          row.push(formatExcelSerialCell(cell.v));
        } else {
          row.push(cell.v);
        }
      }
      csvRows.push(row.join(','));
    }
    const sheetText = csvRows.join('\n');

    // Python版と同じフォーマットで追加
    combinedText.push(`--- SHEET: ${sheetName} ---\n${sheetText}\n`);
  }

  return combinedText.join('\n');
}
