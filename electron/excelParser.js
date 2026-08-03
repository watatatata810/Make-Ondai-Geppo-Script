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
 * SheetJS が cellDates:true で生成した Date インスタンスを、
 * 決定的な文字列表現に変換します。
 *
 * - 時刻のみのセル → "HH:MM"（分単位に四捨五入、秒は出さない）
 * - 日付のみのセル → "YYYY/MM/DD"
 * - 日付+時刻のセル → "YYYY/MM/DD HH:MM"
 *
 * SheetJS の cellDates はローカルタイムゾーンで解釈した暦日時と一致する
 * Date を返す（ローカルの getFullYear/getHours 等で取り出す必要があり、
 * UTC系メソッドと混ぜてはいけない）。
 * 時刻のみのセルは Excel/Lotus 起点日 (1899-12-30 付近) の Date になるため、
 * 年が 1899 以下であれば「時刻のみ」とみなす。
 *
 * @param {Date} date
 * @returns {string}
 */
function formatExcelDateCell(date) {
  // 丸め判定（時刻のみ セル か否か）は、分丸めによる日跨ぎで年が変わる前の
  // 元の値を基準にする。
  const isTimeOnly = date.getFullYear() <= 1899;

  // 分単位への四捨五入は epoch ミリ秒で行うことで、
  // 秒・ミリ秒の繰り上がり（例: 08:59:59.999 → 09:00）を Date の正規化に任せる。
  const roundedMs = Math.round(date.getTime() / 60000) * 60000;
  const rounded = new Date(roundedMs);

  const hh = pad2(rounded.getHours());
  const mm = pad2(rounded.getMinutes());

  if (isTimeOnly) {
    return `${hh}:${mm}`;
  }

  const yyyy = rounded.getFullYear();
  const MM = pad2(rounded.getMonth() + 1);
  const dd = pad2(rounded.getDate());

  const hasTime = rounded.getHours() !== 0 || rounded.getMinutes() !== 0;
  if (hasTime) {
    return `${yyyy}/${MM}/${dd} ${hh}:${mm}`;
  }
  return `${yyyy}/${MM}/${dd}`;
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
  // cellDates:true により、日付/時刻書式のセルは数値シリアル値ではなく
  // JS Date インスタンスとして取得される（数値セル・文字列セルは影響を受けない）。
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

  // すべてのシートを処理
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // シートのデータを二次元配列として取得 (空のセルも保持)
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // 各行をカンマ区切りの文字列（CSV風）に変換
    // 日付/時刻セル（Dateインスタンス）のみ決定的な文字列に変換し、
    // 数値セル・文字列セルはそのまま維持する。
    const csvRows = rawData.map(row =>
      row.map(cell => (cell instanceof Date ? formatExcelDateCell(cell) : cell)).join(',')
    );
    const sheetText = csvRows.join('\n');

    // Python版と同じフォーマットで追加
    combinedText.push(`--- SHEET: ${sheetName} ---\n${sheetText}\n`);
  }

  return combinedText.join('\n');
}
