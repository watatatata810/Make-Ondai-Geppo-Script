#!/usr/bin/env node
/**
 * 日報 Excel から月報 Markdown を作る（アプリの「Claude（サブスク）」と同じ処理）。
 *
 * 使い方:
 *   node scripts/make-report.mjs <日報.xlsx> <out.json> [--campus 池袋キャンパス] [--model sonnet|opus]
 *
 * 出力 (out.json): { markdown, notes, warnings, campusName, filename, elapsedSec }
 *   notes    = 日報の値から変更した箇所（実終了の補正など）
 *   warnings = 月報の書式チェックの警告
 * プロンプトは、アプリで編集済みのもの (config.json の custom-prompt-claude) があればそれを、
 * 無ければリポジトリの ClaudePrompt.md を使う。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDailyReport, dedupeReportParagraphs } from '../electron/dailyReportParser.js';
import { buildClaudeInput, buildReportMarkdown, applyEndTimeCorrections } from '../electron/reportBuilder.js';
import { runClaudeReport } from '../electron/claudeClient.js';
import { processGeneratedReport } from '../electron/reportNormalizer.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const [xlsx, outFile] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!xlsx || !outFile) {
  console.error('usage: node scripts/make-report.mjs <日報.xlsx> <out.json> [--campus 池袋キャンパス] [--model sonnet|opus]');
  process.exit(2);
}

const filename = path.basename(xlsx);
const campusName = opt('campus') || (filename.includes('池袋') ? '池袋キャンパス' : filename.includes('中目黒') ? '中目黒キャンパス' : null);
if (!campusName) {
  console.error('キャンパスをファイル名から判別できません。--campus で指定してください。');
  process.exit(2);
}

function loadPrompt() {
  const cfg = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Make-Ondai-Geppo', 'config.json');
  try {
    const custom = JSON.parse(fs.readFileSync(cfg, 'utf-8'))['custom-prompt-claude'];
    if (custom) return { text: custom, source: 'アプリで編集したプロンプト' };
  } catch {
    // 設定が無ければ既定のプロンプトを使う
  }
  return { text: fs.readFileSync(path.join(root, 'ClaudePrompt.md'), 'utf-8'), source: 'ClaudePrompt.md' };
}

const t0 = Date.now();
const prompt = loadPrompt();
const parsed = parseDailyReport(xlsx);
if (parsed.days.length === 0) throw new Error('日報のシートが見つかりませんでした。');
const input = buildClaudeInput(parsed, dedupeReportParagraphs(parsed.days), campusName);
const result = await runClaudeReport({ systemPrompt: prompt.text, input, model: opt('model', 'sonnet') });
const notes = applyEndTimeCorrections(parsed, result.endTimeCorrections);
const { markdown, warnings } = processGeneratedReport(buildReportMarkdown(parsed, result.reports, { campusName }));

const out = {
  markdown,
  notes,
  warnings,
  campusName,
  filename,
  promptSource: prompt.source,
  days: parsed.days.length,
  lastDate: parsed.days.length ? parsed.days[parsed.days.length - 1].date : null,
  elapsedSec: (Date.now() - t0) / 1000,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 1), 'utf-8');
console.log(`ok ${campusName} days=${out.days} lastDate=${out.lastDate} notes=${notes.length} warnings=${warnings.length} ${out.elapsedSec}s`);
