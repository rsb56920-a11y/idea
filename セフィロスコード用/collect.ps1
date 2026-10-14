# F:\LocalCloudCode(セフィロスコード)の、組み込みに必要な小さいファイルだけをデスクトップに zip でまとめる
# ・AIモデルなどの大きいファイル(20MB超)と、キー・パスワードが入りやすい .env などは入れない
$ErrorActionPreference = "Stop"
$Src = "F:\LocalCloudCode"
if (-not (Test-Path $Src)) { throw "F:\LocalCloudCode が見つかりませんでした" }
$Desk = [Environment]::GetFolderPath("Desktop")
$Tmp = Join-Path $env:TEMP ("sephiroth_send_" + (Get-Date -Format "yyyyMMddHHmmss"))
$Zip = Join-Path $Desk "セフィロスコード_送る用.zip"
$SkipExt = @(".gguf", ".safetensors", ".bin", ".pt", ".pth", ".ckpt", ".onnx", ".zip", ".7z", ".exe", ".dll", ".mp4", ".wav", ".log")
$SkipName = @(".env", "credentials.json", "secrets.json", "token.json")
$SkipDir = @("node_modules", "models", ".git", "venv", ".venv", "__pycache__", "cache", "outputs")
$n = 0
Get-ChildItem -Path $Src -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($Src.Length).TrimStart("\")
  $parts = $rel.Split("\")
  if ($parts | Where-Object { $SkipDir -contains $_.ToLower() }) { return }
  if ($SkipExt -contains $_.Extension.ToLower()) { return }
  if ($SkipName -contains $_.Name.ToLower()) { return }
  if ($_.Length -gt 20MB) { return }
  $dst = Join-Path $Tmp $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $_.FullName $dst
  $n++
}
if ($n -eq 0) { throw "まとめるファイルがありませんでした" }
if (Test-Path $Zip) { Remove-Item $Zip }
Compress-Archive -Path (Join-Path $Tmp "*") -DestinationPath $Zip
Remove-Item $Tmp -Recurse -Force
$mb = [math]::Round((Get-Item $Zip).Length / 1MB, 1)
Write-Host ""
Write-Host "できました: $Zip ($n ファイル / $mb MB)" -ForegroundColor Green
Write-Host "この zip をチャットに添付してください。"
Start-Process explorer.exe "/select,`"$Zip`""
