#!/usr/bin/env node
/**
 * make-report.mjs の結果を Make-Ondai-Geppo アプリの履歴（作成済みの月報）に登録する。
 * アプリを開くと履歴の先頭に出るので、そこから編集・PDF 出力に進める。
 *
 * 使い方:
 *   node scripts/add-to-history.mjs <out.json> [<out.json> ...]
 *
 * - アプリの起動中は書き込まない（アプリ側の保存で上書きされるため）。終了してから実行する。
 * - 書き込む前に config.json を同じフォルダへ config.backup-<日時>.json として控える。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/add-to-history.mjs <out.json> [<out.json> ...]');
  process.exit(2);
}

if (process.platform === 'win32') {
  const list = execSync('tasklist /FI "IMAGENAME eq Make-Ondai-Geppo.exe" /NH', { encoding: 'utf-8' });
  if (list.includes('Make-Ondai-Geppo.exe')) {
    console.error('Make-Ondai-Geppo が起動中です。アプリを終了してから実行してください。');
    process.exit(3);
  }
}

const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Make-Ondai-Geppo');
const cfgPath = path.join(dir, 'config.json');
if (!fs.existsSync(cfgPath)) {
  console.error(`アプリの設定が見つかりません: ${cfgPath}（一度アプリを起動してください）`);
  process.exit(4);
}

const raw = fs.readFileSync(cfgPath, 'utf-8');
const cfg = JSON.parse(raw);
const pad2 = n => String(n).padStart(2, '0');
const stamp = new Date();
const backup = path.join(dir, `config.backup-${stamp.getFullYear()}${pad2(stamp.getMonth() + 1)}${pad2(stamp.getDate())}-${pad2(stamp.getHours())}${pad2(stamp.getMinutes())}${pad2(stamp.getSeconds())}.json`);
fs.writeFileSync(backup, raw, 'utf-8');

const history = Array.isArray(cfg['report-history']) ? cfg['report-history'] : [];
const createdAt = `${pad2(stamp.getMonth() + 1)}/${pad2(stamp.getDate())} ${pad2(stamp.getHours())}:${pad2(stamp.getMinutes())}`;
const added = files.map((f, i) => {
  const r = JSON.parse(fs.readFileSync(f, 'utf-8'));
  return {
    // アプリと同じ形（src/App.jsx の newReport）
    id: String(Date.now() + i),
    filename: r.filename,
    filePath: '',
    campusName: r.campusName,
    markdownContent: r.markdown,
    padding: 40,
    createdAt,
  };
});
cfg['report-history'] = [...added, ...history];
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, '\t'), 'utf-8');
console.log(`履歴に ${added.length} 件登録しました（控え: ${path.basename(backup)}）`);
for (const a of added) console.log(` - ${a.campusName} ${a.filename}`);
