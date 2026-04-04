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

### 月報を生成する

ターミナル（PowerShell等）を開き、本フォルダで以下のコマンドを実行します。

```bash
python generate_monthly_report.py
```

実行が完了すると、フォルダ内に新しい Markdown ファイルが生成されます。

### ドライラン（動作確認のみ）

APIを呼び出さずに、データの抽出が正しく行われているか、送信されるプロンプトのサイズ（文字数）を確認したい場合に使用します。

```bash
python generate_monthly_report.py --dry-run
```

## フォルダ構成

- `generate_monthly_report.py`: メインスクリプト
- `Prompt.md`: Geminiへの詳細な指示プロンプト
- `.env`: APIキー設定ファイル（作成が必要）
- `*.xlsx`: 読み込み対象の日報Excelファイル
- `README.md`: 本ファイル

## 注意事項

- **Gemini API (無料枠)** での利用を想定しており、モデルは高速な `gemini-2.0-flash` を使用しています。
- Excelファイルのデータ量（文字数）が極端に多い場合、APIのトークン制限に達する可能性がありますが、標準的な1ヶ月分（約10万文字程度）であれば問題なく処理可能です。
