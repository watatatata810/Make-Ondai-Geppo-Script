import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Markdown文字列を安全なHTML文字列へ変換する（プレビュー・PDF共通のサニタイズ経路）。 */
export function markdownToSafeHtml(markdownContent) {
  return DOMPurify.sanitize(marked(markdownContent || ''));
}
