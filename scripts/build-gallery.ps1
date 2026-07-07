# build-gallery.ps1 — compress raw generated images into web-weight JPEGs
# and write assets/gallery/manifest.json. Re-runnable; skips already-built files.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$raw = Join-Path $root "assets\gallery\raw"
$out = Join-Path $root "assets\gallery"
if (-not (Test-Path $raw)) { Write-Host "no raw dir"; exit 1 }
$entries = @()
Get-ChildItem $raw -Filter *.png | ForEach-Object {
  $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
  $dest = Join-Path $out "$name.jpg"
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $land = $img.Width -ge $img.Height
  if (-not (Test-Path $dest)) {
    $maxW = 1280
    $w = [Math]::Min($maxW, $img.Width); $h = [int]($img.Height * ($w / $img.Width))
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = "HighQualityBicubic"
    $g.DrawImage($img, 0, 0, $w, $h)
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $p = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]72)
    $bmp.Save($dest, $enc, $p)
    $g.Dispose(); $bmp.Dispose()
  }
  $img.Dispose()
  $entries += [pscustomobject]@{ f = "$name.jpg"; o = $(if ($land) { "l" } else { "p" }) }
}
$manifest = Join-Path $out "manifest.json"
$entries | ConvertTo-Json -Compress | Out-File -Encoding ascii $manifest
Write-Host "built $($entries.Count) images -> manifest.json"
