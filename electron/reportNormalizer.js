/**
 * Gemini が生成した月報Markdownに対する決定的な後処理（正規化）と構造検証を行うモジュール。
 *
 * 仕様の正本: Prompt.md の「3. 出力フォーマット（厳守）」。
 * 実際のAI出力には以下のような「揺れ」が見られるため、再生成はせず機械的に補正する:
 *   - 単独行の水平線 `---` が `***` になっていない
 *   - トップレベル箇条書きが `- ` のままで `* ` になっていない
 *   - タイトル直下のメタデータ（作成日・作成者・月報の期間）が `\` による強制改行、
 *     または空行を挟まない連結行になっている
 *
 * 補正できない構造上の欠落（必須見出しの欠落等）は警告として返すのみで、内容の書き換えは行わない。
 */

const META_KEYS = '(?:作成日|作成者|月報の期間)';

/**
 * Gemini出力Markdownを決定的ルールで正規化する。
 * テーブル行やネストした箇条書きの内容は変更しない。
 *
 * @param {string} markdown 正規化対象のMarkdownテキスト
 * @returns {string} 正規化後のMarkdownテキスト
 */
export function normalizeReportMarkdown(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return markdown;
  }

  // 改行コードをLFに統一（末尾で必要なら呼び出し側に委ねる。ここでは内部処理用）
  let text = markdown.replace(/\r\n/g, '\n');

  // 1. 単独行の水平線 `---`（3つ以上のハイフンのみの行）→ `***`
  //    テーブルの区切り行は必ず `|` を含むため誤爆しない。
  text = text.replace(/^-{3,}[ \t]*$/gm, '***');

  // 2. トップレベル箇条書き `- ` → `* `
  //    ネストした箇条書み（行頭にインデントがあるもの）は対象外。
  text = text.replace(/^- /gm, '* ');

  // 3. メタデータ部（作成日・作成者・月報の期間）の補正
  //    3-a. 行末の強制改行用バックスラッシュを除去
  const trailingBackslashRe = new RegExp(
    `^(\\*\\*${META_KEYS}\\*\\*:.*?)[ \\t]*\\\\[ \\t]*$`,
    'gm'
  );
  text = text.replace(trailingBackslashRe, '$1');

  //    3-b. メタデータ行同士が空行を挟まず連結している場合、間に空行を挿入
  const adjacentMetaRe = new RegExp(
    `^(\\*\\*${META_KEYS}\\*\\*:.*)$\\n(?=\\*\\*${META_KEYS}\\*\\*:)`,
    'gm'
  );
  text = text.replace(adjacentMetaRe, '$1\n\n');

  return text;
}

// 必須見出し（Prompt.md 3章）。数字の全角/半角・句読点の揺れを許容する。
const REQUIRED_SECTIONS = [
  { num: ['1', '１'], label: '今月の集計サマリー' },
  { num: ['2', '２'], label: '勤務者データ' },
  { num: ['3', '３'], label: '催事データ' },
  { num: ['4', '４'], label: '報告事項まとめ' },
];

/**
 * 正規化後のMarkdownが、Prompt.md 3章で定める必須構造（タイトル行・4つの見出し）を
 * 満たしているかを検証する。欠落があっても再生成はせず、警告メッセージを返すのみ。
 *
 * @param {string} markdown 検証対象のMarkdownテキスト
 * @returns {string[]} 警告メッセージの配列（問題なければ空配列）
 */
export function validateReportStructure(markdown) {
  const warnings = [];
  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    warnings.push('生成されたMarkdownが空です。');
    return warnings;
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  // タイトル行: `#` 1つ + 半角スペース で始まる行（`##` 以上の見出しは除外）
  const hasTitle = lines.some((l) => {
    const trimmed = l.trim();
    return /^#[ \t]+\S/.test(trimmed) && !/^##/.test(trimmed);
  });
  if (!hasTitle) {
    warnings.push('タイトル行（"# " で始まる1行目）が見つかりません。');
  }

  REQUIRED_SECTIONS.forEach(({ num, label }) => {
    const numPattern = num.join('');
    const sectionRe = new RegExp(`^##[ \\t]*[${numPattern}][．.、]`);
    const found = lines.some((l) => sectionRe.test(l.trim()));
    if (!found) {
      warnings.push(`必須見出し「## ${num[0]}．${label}」が見つかりません。`);
    }
  });

  return warnings;
}

/**
 * generate-markdown ハンドラから呼び出す想定の統合エントリポイント。
 * 正規化を適用した上で構造検証を行い、両方の結果をまとめて返す。
 *
 * @param {string} markdown Gemini生成直後のMarkdownテキスト
 * @returns {{ markdown: string, warnings: string[] }}
 */
export function processGeneratedReport(markdown) {
  const normalized = normalizeReportMarkdown(markdown);
  const warnings = validateReportStructure(normalized);
  return { markdown: normalized, warnings };
}
