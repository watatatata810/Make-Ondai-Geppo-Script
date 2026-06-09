import * as XLSX from 'xlsx';
import fs from 'fs';

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
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // すべてのシートを処理
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    
    // シートのデータを二次元配列として取得 (空のセルも保持)
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    
    // 各行をカンマ区切りの文字列（CSV風）に変換
    const csvRows = rawData.map(row => row.join(','));
    const sheetText = csvRows.join('\n');
    
    // Python版と同じフォーマットで追加
    combinedText.push(`--- SHEET: ${sheetName} ---\n${sheetText}\n`);
  }
  
  return combinedText.join('\n');
}
