# 追加アプリ(キャラクターチャット・画像から動画)を、セフィロスコード(またはイージス)の web フォルダに入れる
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Targets = @("F:\LocalCloudCode\web")
# イージスなど、ほかのアプリにも入れたいときは、そのアプリの web フォルダ(画面のファイルがある所)を下に足す
# $Targets += "F:\Aegis\web"
foreach ($t in $Targets) {
  if (-not (Test-Path $t)) { Write-Host "見つからないのでスキップ: $t" -ForegroundColor Yellow; continue }
  $dst = Join-Path $t "extras"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  foreach ($f in @("index.html", "ZETA風チャット.html", "画像から動画.html")) { Copy-Item (Join-Path $Here $f) (Join-Path $dst $f) -Force }
  Write-Host "入れました: $dst" -ForegroundColor Green
}
Write-Host ""
Write-Host "セフィロスコードを起動して、アドレスの最後に /extras/ をつけて開いてください(例: http://localhost:ポート番号/extras/)。"
Write-Host "または、extras フォルダの index.html をダブルクリックしても開けます。"
