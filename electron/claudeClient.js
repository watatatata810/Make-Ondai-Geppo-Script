import { spawn } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * Claude Code CLI (`claude -p`) を呼び出して、報告事項まとめと実終了の補正候補を JSON で受け取る。
 *
 * サブスク（Pro/Max）のログインで動かすための前提（公式: https://code.claude.com/docs/en/headless ,
 * https://support.claude.com/en/articles/15036540 を 2026-11-06 に確認）:
 *   - `--bare` は API キー必須になるので付けない。
 *   - ANTHROPIC_API_KEY 等が環境にあると API 課金側で動きうるので、子プロセスの環境から外す。
 * このPCの Claude Code の設定（CLAUDE.md・フック・MCP・スキル）を読み込ませないため、
 * 空の一時フォルダで実行し、--setting-sources "" / --strict-mcp-config / --tools "" /
 * --disable-slash-commands / --system-prompt-file を指定する。
 */

export const CLAUDE_MODELS = ['sonnet', 'opus'];

const STRIP_ENV = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reports: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'MM/DD' },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['date', 'title', 'body'],
      },
    },
    endTimeCorrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          time: { type: 'string', description: 'HH:MM' },
          quote: { type: 'string' },
        },
        required: ['eventId', 'time', 'quote'],
      },
    },
  },
  required: ['reports', 'endTimeCorrections'],
};

/** claude.exe の場所を探す。見つからなければ null。 */
export function resolveClaudePath() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [path.join(os.homedir(), '.local', 'bin', exe)];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, exe));
  }
  return candidates.find(p => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) || null;
}

function childEnv() {
  const env = { ...process.env };
  for (const k of STRIP_ENV) delete env[k];
  return env;
}

function friendlyError(text) {
  const t = String(text || '');
  if (/not logged in|please run \/login|invalid api key|authentication|oauth|401/i.test(t)) {
    return 'Claude Code にログインしていないか、ログインの期限が切れています。ターミナルで `claude` を起動し、`/login` でログインしてから再度お試しください。';
  }
  if (/rate.?limit|usage limit|limit reached|429/i.test(t)) {
    return 'Claude のプランの使用上限に達しました。上限がリセットされるまで待つか、Gemini エンジンをお使いください。';
  }
  return null;
}

/**
 * @param {{ systemPrompt: string, input: string, model?: string, signal?: AbortSignal }} args
 * @returns {Promise<{ reports: Array, endTimeCorrections: Array }>}
 */
export async function runClaudeReport({ systemPrompt, input, model = 'sonnet', signal }) {
  const claudePath = resolveClaudePath();
  if (!claudePath) {
    throw new Error('Claude Code (claude.exe) が見つかりません。Claude Code をインストールし、ターミナルで `claude` を一度起動してログインしてください。');
  }
  if (!CLAUDE_MODELS.includes(model)) model = 'sonnet';

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ondai-geppo-claude-'));
  const promptFile = path.join(workDir, 'system-prompt.md');
  await fs.writeFile(promptFile, systemPrompt, 'utf-8');

  const args = [
    '-p',
    '--system-prompt-file', promptFile,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--model', model,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(REPORT_SCHEMA),
    '標準入力の日報データを読み、システムプロンプトの指示どおりに reports と endTimeCorrections を返してください。',
  ];

  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(claudePath, args, { cwd: workDir, env: childEnv(), windowsHide: true });
      const out = [];
      const err = [];
      const onAbort = () => child.kill();
      if (signal) {
        if (signal.aborted) onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }
      child.stdout.on('data', b => out.push(b));
      child.stderr.on('data', b => err.push(b));
      child.on('error', e => reject(e));
      child.on('close', code => {
        if (signal) signal.removeEventListener('abort', onAbort);
        const text = Buffer.concat(out).toString('utf-8');
        if (signal && signal.aborted) return reject(new Error('aborted'));
        if (code !== 0 && !text.trim()) {
          const e = Buffer.concat(err).toString('utf-8');
          return reject(new Error(friendlyError(e) || `Claude Code が異常終了しました (終了コード ${code})。\n${e.slice(0, 500)}`));
        }
        resolve(text);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input, 'utf-8');
    });

    let json;
    try {
      json = JSON.parse(stdout);
    } catch {
      throw new Error(friendlyError(stdout) || `Claude Code の出力を読み取れませんでした。\n${stdout.slice(0, 500)}`);
    }
    if (json.is_error) {
      throw new Error(friendlyError(json.result) || `Claude Code がエラーを返しました: ${String(json.result).slice(0, 500)}`);
    }
    const so = json.structured_output;
    if (!so || !Array.isArray(so.reports)) {
      throw new Error('Claude Code から決められた形式の結果が返りませんでした。もう一度お試しください。');
    }
    return { reports: so.reports, endTimeCorrections: Array.isArray(so.endTimeCorrections) ? so.endTimeCorrections : [] };
  } finally {
    await fs.remove(workDir).catch(() => {});
  }
}
