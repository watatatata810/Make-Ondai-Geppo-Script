import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ビルド成果物のみにCSPメタタグを注入するプラグイン。
// devモード（Vite dev server / HMR / @vitejs/plugin-reactのインラインpreamble）には
// 一切干渉しないよう、apply: 'build' でビルド時のみ有効化する。
function injectBuildCsp() {
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";
  return {
    name: 'inject-build-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`
      );
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), injectBuildCsp()],
  server: {
    port: 5173,
    strictPort: true
  }
})
