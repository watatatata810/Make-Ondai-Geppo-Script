/**
 * Claude エンジン用: 日報から機械的に取り出したデータと、Claude が返した報告事項・退館時刻の補正から
 * 月報 Markdown を組み立てる。書式は Prompt.md「3. 出力フォーマット（厳守）」に合わせる。
 *
 * 集計の仕様（2026-11-06 ユーザー確認済み）:
 *   - 中止の催事（予定・実績の時刻欄に「中止」を含む）は表に載せ、実開始/実終了を「中止」と表示する。
 *     総催事数・月間総利用者数・月間総観覧者数からは除く。
 *   - 人数は各催事の人数欄の単純合計（丸めない）。表記は「約X,XXX名」。
 *   - 開始差 = 実開始 − 予定開始、終了差 = 実終了 − 予定終了（分）。片方が無ければ「記載なし」、0 は「±0分」。
 *   - 実終了は、実施行程に書かれた退館時刻を優先する（Claude が根拠の行を引用し、本文に実在する場合のみ採用）。
 */

export const DEFAULT_AUTHOR = '坂本 渉';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMinutes(t) {
  const m = typeof t === 'string' && t.match(/^(\d{2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

export function formatDiff(plan, actual) {
  const p = toMinutes(plan);
  const a = toMinutes(actual);
  if (p === null || a === null) return '記載なし';
  const d = a - p;
  return d === 0 ? '±0分' : `${d > 0 ? '+' : ''}${d}分`;
}

function escapeCell(s) {
  return String(s).replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' ');
}

function normalizeForSearch(s) {
  return String(s || '').replace(/[\s　]/g, '').replace(/：/g, ':');
}

/**
 * Claude が返した退館時刻の補正を検証して適用する。
 * 採用条件: eventId が存在し、quote が当日の実施行程に（空白を無視して）含まれ、quote に「退館」と time が含まれること。
 * @returns {string[]} 警告・補正メモ
 */
export function applyEndTimeCorrections(parsed, corrections) {
  const notes = [];
  if (!Array.isArray(corrections)) return notes;
  const byId = new Map();
  for (const day of parsed.days) for (const ev of day.events) byId.set(ev.id, { ev, day });

  for (const c of corrections) {
    const hit = byId.get(c && c.eventId);
    if (!hit) continue;
    const { ev, day } = hit;
    const time = typeof c.time === 'string' ? c.time.replace('：', ':').replace(/^(\d):/, '0$1:') : '';
    if (ev.cancelled || !/^\d{2}:\d{2}$/.test(time)) continue;
    const quote = normalizeForSearch(c.quote);
    const narrative = normalizeForSearch(day.narrative);
    const timeInQuote = quote.includes(time) || quote.includes(time.replace(/^0/, ''));
    if (!quote || !narrative.includes(quote) || !quote.includes('退館') || !timeInQuote) {
      notes.push(`${day.date} ${ev.title}: 実終了の補正候補 ${time} は実施行程に根拠が見つからないため採用しませんでした。`);
      continue;
    }
    if (ev.actEnd.time === time) continue;
    const before = ev.actEnd.text || '記載なし';
    ev.actEnd = { time, text: time, cancelled: false };
    notes.push(`${day.date} ${ev.title}: 実終了を ${before} → ${time} に変更（実施行程「${String(c.quote).trim()}」）`);
  }
  return notes;
}

/**
 * @param {object} parsed parseDailyReport の結果（補正適用後）
 * @param {Array<{date:string,title:string,body:string}>} reportItems Claude が返した報告事項
 * @param {{ campusName: string, author?: string, today?: Date }} opts
 */
export function buildReportMarkdown(parsed, reportItems, { campusName, author = DEFAULT_AUTHOR, today = new Date() }) {
  const { year, month, days } = parsed;
  const yyyy = year ? String(year) : '----';
  const mm = month ? pad2(month) : '--';
  const lastDay = year && month ? new Date(year, month, 0).getDate() : '--';
  const created = `${today.getFullYear()}年${pad2(today.getMonth() + 1)}月${pad2(today.getDate())}日`;

  const allEvents = days.flatMap(d => d.events.map(ev => ({ ...ev, date: d.date })));
  const counted = allEvents.filter(ev => !ev.cancelled);
  const sum = key => counted.reduce((acc, ev) => acc + (ev[key] || 0), 0);
  const fmt = n => n.toLocaleString('ja-JP');

  const lines = [];
  lines.push(`# ${yyyy}年${mm}月 ホール業務実施報告書（${campusName}）`, '');
  lines.push(`**作成日**: ${created}`, '');
  lines.push(`**作成者**: ${author}`, '');
  lines.push(`**月報の期間**: ${yyyy}年${mm}月01日～${yyyy}年${mm}月${lastDay}日`, '');
  lines.push('***', '');

  lines.push('## 1．今月の集計サマリー', '');
  lines.push(`* **総催事数**: ${counted.length}件（本番・ガイダンス・授業等の合計）`, '');
  lines.push(`* **月間総利用者数**: 約${fmt(sum('users'))}名`, '');
  lines.push(`* **月間総観覧者数**: 約${fmt(sum('viewers'))}名`, '');
  lines.push('***', '');

  lines.push('## 2．勤務者データ', '');
  lines.push('| 日付 | 氏名 | 出勤時間 | 退勤時間 |', '| --- | --- | --- | --- |');
  for (const d of days) {
    for (const s of d.staff) lines.push(`| ${d.date} | ${escapeCell(s.name)} | ${s.in} | ${s.out} |`);
  }
  lines.push('', '***', '');

  lines.push('## 3．催事データ', '');
  lines.push('| 日付 | 催事名 | 予定開始 | 予定終了 | 実開始 | 実終了 | 開始差 | 終了差 | 利用者 | 観覧者 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const ev of allEvents) {
    const ps = ev.planStart.text || '記載なし';
    const pe = ev.planEnd.text || '記載なし';
    const as = ev.cancelled ? '中止' : (ev.actStart.text || '記載なし');
    const ae = ev.cancelled ? '中止' : (ev.actEnd.text || '記載なし');
    const sd = ev.cancelled ? '記載なし' : formatDiff(ev.planStart.time, ev.actStart.time);
    const ed = ev.cancelled ? '記載なし' : formatDiff(ev.planEnd.time, ev.actEnd.time);
    const u = ev.users === null ? '記載なし' : ev.users;
    const v = ev.viewers === null ? '記載なし' : ev.viewers;
    lines.push(`| ${ev.date} | ${escapeCell(ev.title)} | ${ps} | ${pe} | ${escapeCell(as)} | ${escapeCell(ae)} | ${sd} | ${ed} | ${u} | ${v} |`);
  }
  lines.push('', '***', '');

  lines.push('## 4．報告事項まとめ', '');
  const items = (Array.isArray(reportItems) ? reportItems : [])
    .filter(it => it && it.title && it.body)
    .map(it => ({ ...it, date: String(it.date || '').trim() }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) {
    lines.push('* 特記事項なし', '');
  }
  for (const it of items) {
    lines.push(`* **${it.date} ${String(it.title).trim()}**`, '');
    lines.push(`  * ${String(it.body).trim().replace(/\s*\n\s*/g, ' ')}`, '');
  }

  return lines.join('\n');
}

/**
 * Claude に渡す入力テキストを作る。表のデータは Claude が書き換えないよう参照用にだけ渡す。
 */
export function buildClaudeInput(parsed, dedupedReports, campusName) {
  const out = [];
  out.push(`対象: ${parsed.year}年${parsed.month}月 ${campusName}`, '');
  out.push('=== 報告事項・引き継ぎ（毎日書き写される同一の段落は1つにまとめ済み。firstDate=初出日, lastDate=最終記載日） ===');
  dedupedReports.forEach((r, i) => {
    out.push(`--- [R${i + 1}] firstDate=${r.firstDate} lastDate=${r.lastDate}`, r.text);
  });
  out.push('', '=== 日別の実施行程と催事 ===');
  for (const d of parsed.days) {
    out.push(`--- ${d.date}`);
    for (const ev of d.events) {
      out.push(`催事 eventId=${ev.id} 「${ev.title}」 予定 ${ev.planStart.text || '記載なし'}-${ev.planEnd.text || '記載なし'} / 日報の実績欄 ${ev.actStart.text || '記載なし'}-${ev.actEnd.text || '記載なし'}${ev.cancelled ? ' (中止)' : ''}`);
    }
    out.push('[実施行程]', d.narrative || '(記載なし)');
  }
  return out.join('\n');
}
