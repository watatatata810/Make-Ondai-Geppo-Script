# このスクリプトが存在する scripts フォルダの親ディレクトリ（プロジェクトルート）を作業ディレクトリに設定
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " [1/3] Excelデータから月報を自動生成しています..." -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
# scriptsフォルダ内のスクリプトを実行
python scripts/generate_monthly_report.py

# Pythonスクリプトの終了コードを判定
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "処理対象のExcelファイルが見つからなかったか、エラーが発生したため、処理を中断します。" -ForegroundColor Yellow
    Read-Host "Enterキーを押すと終了します..."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " [2/3] PDF変換用サーバーを起動しています..." -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
# 別窓のPowerShellで非同期に npm run start を起動
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " [3/3] サーバーの起動を待ってブラウザを開きます..." -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
# 3秒待機
Start-Sleep -Seconds 3

# 既定のブラウザでURLを開く
Start-Process "http://localhost:5173/"

Write-Host ""
Write-Host "処理が完了しました。" -ForegroundColor Green
Write-Host "このウィンドウは閉じて構いません（サーバーのウィンドウは開いたままにしてください）。"
Read-Host "Enterキーを押すと終了します..."
