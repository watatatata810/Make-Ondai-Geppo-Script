import * as XLSX from 'xlsx';
import fs from 'fs';

/**
 * ホール業務日報（1シート = 1日）の決まった書式から、勤務者・催事・実施行程・報告事項を
 * AIを介さずに機械的に取り出すモジュール。
 *
 * 書式（池袋・中目黒共通、2026年9〜10月の日報で確認）:
 *   A2            日付
 *   A6 「氏　名」  の次の行から 勤務者（A=氏名, C=出勤時間, D=退勤時間）
 *   A14「開始予定」の次の行から 催事（A=予定開始, B=予定終了, C=実開始, D=実終了, E=催事名, H=利用者数, I=観覧者数）
 *   A24「■実施行程（詳細）」の次の行 A列 = 実施行程, G列 = 報告事項・引き継ぎ
 * 見出しが見つからない場合は上記の既定行にフォールバックする。
 *
 * 日付・時刻は JS の Date を経由せず、Excel のシリアル値（数値）から直接計算する。
 * 時刻だけのセルは 1899-12-30 起点の Date になる。cellDates:true + Date の getHours() で読む方式では、
 * Playwright から起動したこのアプリの main プロセスで時刻が 9 時間ずれ、日付が 1900/01/01 になるセルも出た
 * （2026-11-06。Node 単体や最小構成の Electron では再現せず、原因は未特定）。シリアル値ならタイムゾーンに依存しない。
 */

const COL = { A: 0, B: 1, C: 2, D: 3, E: 4, G: 6, H: 7, I: 8 };
const DEFAULT_ROWS = { staffHeader: 6, eventHeader: 14, narrativeHeader: 24 }; // 1始まりの行番号

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Excel のシリアル値の小数部（1日の割合）を "HH:MM" に。秒は分に丸める。 */
export function serialToTime(serial) {
  const minutes = Math.round((serial - Math.floor(serial)) * 1440) % 1440;
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function cell(sheet, row1, col) {
  return sheet[XLSX.utils.encode_cell({ r: row1 - 1, c: col })];
}

function rawValue(sheet, row1, col) {
  const c = cell(sheet, row1, col);
  return c ? c.v : undefined;
}

function textValue(sheet, row1, col) {
  const c = cell(sheet, row1, col);
  if (!c || c.v === undefined || c.v === null) return '';
  if (c.t === 'n') return c.w !== undefined ? String(c.w).trim() : String(c.v);
  return String(c.v).replace(/\r\n/g, '\n').trim();
}

/** 列Aで、指定の文字列で始まるセルの行番号(1始まり)を探す。 */
function findRow(sheet, prefix, maxRow, fallback) {
  for (let r = 1; r <= maxRow; r++) {
    const v = rawValue(sheet, r, COL.A);
    if (typeof v === 'string' && v.replace(/\s/g, '').startsWith(prefix.replace(/\s/g, ''))) return r;
  }
  return fallback;
}

/**
 * 時刻セルを解釈する。
 * @returns {{ time: string|null, text: string, cancelled: boolean }}
 *   time: 分単位に正規化した "HH:MM"（解釈できない場合 null）
 *   text: 表に出す文字列（空欄なら ''）
 */
export function parseTimeCell(v) {
  if (v === undefined || v === null || v === '') return { time: null, text: '', cancelled: false };
  if (typeof v === 'number') {
    const t = serialToTime(v);
    return { time: t, text: t, cancelled: false };
  }
  const s = String(v).trim();
  if (s.includes('中止')) return { time: null, text: '中止', cancelled: true };
  const m = s.match(/^(\d{1,2})[:：](\d{2})/);
  if (m) {
    const t = `${m[1].padStart(2, '0')}:${m[2]}`;
    return { time: t, text: t, cancelled: false };
  }
  return { time: null, text: s, cancelled: false };
}

/** "65名" や 65.0 を整数に。読めなければ null。 */
export function parseCount(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const m = String(v).replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * @param {string} filePath 日報 .xlsx のパス
 * @returns {{
 *   year: number|null, month: number|null,
 *   days: Array<{ date: string, sheetName: string,
 *     staff: Array<{ name: string, in: string, out: string }>,
 *     events: Array<{ id: string, title: string, planStart: object, planEnd: object, actStart: object, actEnd: object, users: number|null, viewers: number|null, cancelled: boolean }>,
 *     narrative: string, report: string }>
 * }}
 */
export function parseDailyReport(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const days = [];
  let year = null;
  let month = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : { e: { r: 60 } };
    const maxRow = Math.min(range.e.r + 1, 200);

    // 日付は A2 から取る（シート名は "11 " のように揺れるため使わない）
    const d = rawValue(sheet, 2, COL.A);
    const dc = typeof d === 'number' ? XLSX.SSF.parse_date_code(d) : null;
    let date;
    if (dc && dc.y > 1900) {
      date = `${pad2(dc.m)}/${pad2(dc.d)}`;
      if (year === null) {
        year = dc.y;
        month = dc.m;
      }
    } else {
      date = /^\d+$/.test(sheetName.trim()) ? `${pad2(month || 0)}/${pad2(sheetName.trim())}` : sheetName.trim();
    }

    const staffHeader = findRow(sheet, '氏名', 20, DEFAULT_ROWS.staffHeader);
    const eventHeader = findRow(sheet, '開始予定', 30, DEFAULT_ROWS.eventHeader);
    const narrativeHeader = findRow(sheet, '■実施行程', maxRow, DEFAULT_ROWS.narrativeHeader);
    const hallHeader = findRow(sheet, '■ホール利用管理', 30, eventHeader - 2);

    const staff = [];
    for (let r = staffHeader + 1; r < hallHeader; r++) {
      const name = textValue(sheet, r, COL.A);
      if (!name) continue;
      staff.push({
        name,
        in: parseTimeCell(rawValue(sheet, r, COL.C)).text || '記載なし',
        out: parseTimeCell(rawValue(sheet, r, COL.D)).text || '記載なし',
      });
    }

    const events = [];
    for (let r = eventHeader + 1; r < narrativeHeader; r++) {
      const title = textValue(sheet, r, COL.E).replace(/\s*\n\s*/g, ' ');
      if (!title) continue;
      const planStart = parseTimeCell(rawValue(sheet, r, COL.A));
      const planEnd = parseTimeCell(rawValue(sheet, r, COL.B));
      const actStart = parseTimeCell(rawValue(sheet, r, COL.C));
      const actEnd = parseTimeCell(rawValue(sheet, r, COL.D));
      events.push({
        id: `${date}#${events.length + 1}`,
        title,
        planStart,
        planEnd,
        actStart,
        actEnd,
        users: parseCount(rawValue(sheet, r, COL.H)),
        viewers: parseCount(rawValue(sheet, r, COL.I)),
        cancelled: actStart.cancelled || actEnd.cancelled || planStart.cancelled || planEnd.cancelled,
      });
    }

    days.push({
      date,
      sheetName,
      staff,
      events,
      narrative: textValue(sheet, narrativeHeader + 1, COL.A),
      report: textValue(sheet, narrativeHeader + 1, COL.G),
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return { year, month, days };
}

/**
 * 毎日書き写される報告事項・引き継ぎを段落（空行区切り）単位で重複除去する。
 * 空白・改行の違いは無視して同一とみなし、初出日と最終日を残す。
 * @returns {Array<{ text: string, firstDate: string, lastDate: string }>}
 */
export function dedupeReportParagraphs(days) {
  const map = new Map();
  for (const day of days) {
    if (!day.report) continue;
    const paragraphs = day.report.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (const p of paragraphs) {
      const key = p.replace(/\s/g, '');
      if (!key) continue;
      const hit = map.get(key);
      if (hit) {
        hit.lastDate = day.date;
      } else {
        map.set(key, { text: p, firstDate: day.date, lastDate: day.date });
      }
    }
  }
  return [...map.values()];
}
