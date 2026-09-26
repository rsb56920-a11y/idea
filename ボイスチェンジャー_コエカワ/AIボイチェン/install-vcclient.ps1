# AIボイチェン(VCClient)を自動で入れて起動する
# 1. 公式の置き場所(Hugging Face: wok000/vcclient000)から、Windows・NVIDIA用(cuda)の最新版を探す
# 2. ダウンロードして F:\VCClient に展開(すでにあればダウンロードしない)
# 3. start_http.bat を起動
$ErrorActionPreference = "Stop"
$Dest = "F:\VCClient"
if (-not (Test-Path "F:\")) { $Dest = Join-Path $env:USERPROFILE "VCClient" }
Write-Host ""
Write-Host "=== AIボイチェン(VCClient)の準備 ===" -ForegroundColor Magenta
Write-Host "入れる場所: $Dest"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# すでに入っていれば、そのまま起動
$bat = Get-ChildItem -Path $Dest -Recurse -Filter "start_http.bat" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $bat) {
  Write-Host "最新版を探しています..."
  $api = Invoke-RestMethod -Uri "https://huggingface.co/api/models/wok000/vcclient000" -UseBasicParsing
  $cands = @($api.siblings | ForEach-Object { $_.rfilename } | Where-Object { $_ -match "win" -and $_ -match "cuda" -and $_ -match "\.zip$" })
  if ($cands.Count -eq 0) { throw "Windows・cuda用のファイルが見つかりませんでした。手順書の方法で手動でダウンロードしてください。" }
  # 版の番号(例 2.2.2)が一番大きいものを選ぶ
  $best = $cands | Sort-Object -Descending -Property @{ Expression = {
    if ($_ -match "(\d+)\.(\d+)\.(\d+)") { [int]$matches[1] * 1000000 + [int]$matches[2] * 1000 + [int]$matches[3] } else { 0 } } } | Select-Object -First 1
  $url = "https://huggingface.co/wok000/vcclient000/resolve/main/" + $best
  $zip = Join-Path $Dest ([System.IO.Path]::GetFileName($best))
  Write-Host "ダウンロード: $best"
  Write-Host "(数GBあります。回線によっては30分以上かかります。この画面は閉じないでください)" -ForegroundColor Yellow
  & curl.exe -L --fail -o $zip $url
  if ($LASTEXITCODE -ne 0) { throw "ダウンロードに失敗しました。もう一度このファイルをダブルクリックしてください。" }
  Write-Host "展開しています..."
  & tar.exe -xf $zip -C $Dest
  if ($LASTEXITCODE -ne 0) { Expand-Archive -Path $zip -DestinationPath $Dest -Force }
  Remove-Item $zip -ErrorAction SilentlyContinue
  $bat = Get-ChildItem -Path $Dest -Recurse -Filter "start_http.bat" | Select-Object -First 1
  if (-not $bat) { throw "start_http.bat が見つかりませんでした。$Dest の中を見て、起動用のファイルをダブルクリックしてください。" }
}
Write-Host ""
Write-Host "起動します。はじめての起動は、必要なデータのダウンロードに1〜2分かかります。" -ForegroundColor Green
Write-Host "ブラウザが開いたら START を押してください。使い方は「AIボイチェン_無料で使う手順.html」を見てね。"
Start-Process -FilePath $bat.FullName -WorkingDirectory $bat.DirectoryName
