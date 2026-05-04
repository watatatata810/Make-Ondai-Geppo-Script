# ホール業務月報生成ツール (Gemini API 版)

このツールは、日報が記録された Excel ファイルを読み込み、Gemini API (Google AI SDK) を使用して指定されたプロンプト形式に従い、Markdown形式の「月報」を自動生成する Python スクリプトです。

## 機能

- **自動判別**: Excelファイル名から「池袋キャンパス」または「中目黒キャンパス」を自動判別します。
- **データ抽出**: Excel内の全日付シートから勤務データ、催事データ、報告事項をテキスト化して抽出します。
- **AI生成**: 抽出したデータを `Prompt.md` の指示に従って Gemini (gemini-2.0-flash) が整形・要約します。
- **Markdown出力**: `20XX年XX月度_ホール業務月報_（キャンパス名）.md` として保存します。

## セットアップ

### 1. 必要なライブラリのインストール

以下のコマンドを実行して、必要なパッケージをインストールしてください。

```bash
pip install google-genai pandas openpyxl python-dotenv
```

### 2. APIキーの設定

`.env.example` をコピーして `.env` ファイルを作成し、ご自身の Gemini API キーを記入してください。
キーはここから取得できます(https://aistudio.google.com/api-keys)

```env
GEMINI_API_KEY=あなたのAPIキーをここに記入
```

## 使い方

### 1.月報ファイルを配置する

プロジェクトルートにエクセルファイルを配置します。ファイル名の形式は「XXXX年XX月度_〇〇キャンパス_業務日報.xlsx」としてください

### 2.月報を生成する

ターミナル（PowerShell等）を開き、本フォルダで以下のコマンドを実行します。

```bash
python generate_monthly_report.py
```

実行が完了すると、フォルダ内に新しい Markdown 形式の月報が生成されます。
処理が完了すると、元のExcelファイルと生成されたMarkdownファイルは自動的に `Archive` フォルダに移動されます。

### 3.マークダウンファイルを編集する。

Markdownファイルを開き、AIが生成した月報を確認します。必要に応じて修正してください。

### 4.月報をPDF化する（CLI版）

ターミナルで以下のコマンドを実行すると、フォルダ内のMarkdownファイルを一括で「改ページなし・横幅自動調整済み」のPDFに変換します。

```bash
npm run convert
```

### 4-2.月報をPDF化する（GUI版）

ブラウザ上で確認しながら、余白（Padding）を自由に調整してPDFを生成できます。

1. 以下のコマンドで開発サーバーを起動します。
   ```bash
   npm run start
   ```
2. ブラウザで **[http://localhost:5173/](http://localhost:5173/)** を開きます。
3. ファイルを選択し、スライダーで余白を調整して「PDFを生成」をクリックします。

### ドライラン（動作確認のみ）

APIを呼び出さずに、データの抽出が正しく行われているか、送信されるプロンプトのサイズ（文字数）を確認したい場合に使用します。

```bash
python generate_monthly_report.py --dry-run
```

## フォルダ構成

- `generate_monthly_report.py`: 月報生成メインスクリプト（Python）
- `Prompt.md`: Geminiへの詳細な指示プロンプト
- `server/`: PDF変換用バックエンドサーバー（Express/Puppeteer）
- `src/`: PDF変換用フロントエンド画面（React/Vite）
- `scripts/`: 
    - `md-to-pdf-cli.js`: コマンドライン用PDF変換スクリプト
- `package.json`: Node.js依存関係および実行スクリプトの定義
- `Archive/`: 処理済みファイル保存用（自動作成）
- `.env`: APIキー等の設定ファイル
- `README.md`: 本ファイル

## 注意事項

- **Node.jsのインストール**: PDF変換機能を利用するには、Node.js (v18以上推奨) が必要です。初回利用前に `npm install` を実行してください。
- **Gemini API (無料枠)**: モデルは高速な `gemini-3-flash-preview` を使用しています。
- **改ページなしPDF**: Puppeteerを使用してコンテンツの高さに合わせた1ページ構成のPDFを生成します。
