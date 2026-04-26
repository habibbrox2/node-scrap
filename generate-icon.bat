@echo off
REM Generate a simple PNG icon for Brox Scraper

setlocal

if not exist assets (
    mkdir assets
)

echo Creating assets\icon.png...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Add-Type -AssemblyName System.Drawing; ^
$size = 256; ^
$bmp = New-Object System.Drawing.Bitmap($size, $size); ^
$g = [System.Drawing.Graphics]::FromImage($bmp); ^
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; ^
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit; ^
$bg = [System.Drawing.Color]::FromArgb(245,240,232); ^
$ink = [System.Drawing.Color]::FromArgb(13,13,13); ^
$red = [System.Drawing.Color]::FromArgb(232,22,42); ^
$g.Clear($bg); ^
$shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30,0,0,0)); ^
$g.FillEllipse($shadowBrush, 28, 32, 200, 200); ^
$circleBrush = New-Object System.Drawing.SolidBrush($ink); ^
$g.FillEllipse($circleBrush, 24, 24, 200, 200); ^
$ringPen = New-Object System.Drawing.Pen($red, 12); ^
$g.DrawEllipse($ringPen, 24, 24, 200, 200); ^
$font = New-Object System.Drawing.Font('Segoe UI', 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel); ^
$format = New-Object System.Drawing.StringFormat; ^
$format.Alignment = [System.Drawing.StringAlignment]::Center; ^
$format.LineAlignment = [System.Drawing.StringAlignment]::Center; ^
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White); ^
$g.DrawString('B', $font, $textBrush, [System.Drawing.RectangleF]::new(24, 18, 200, 200), $format); ^
$barBrush = New-Object System.Drawing.SolidBrush($red); ^
$g.FillRectangle($barBrush, 86, 176, 84, 14); ^
$bmp.Save('assets/icon.png', [System.Drawing.Imaging.ImageFormat]::Png); ^
$barBrush.Dispose(); ^
$textBrush.Dispose(); ^
$font.Dispose(); ^
$ringPen.Dispose(); ^
$circleBrush.Dispose(); ^
$shadowBrush.Dispose(); ^
$g.Dispose(); ^
$bmp.Dispose();"

if errorlevel 1 (
    echo Failed to create assets\icon.png.
    exit /b 1
)

echo Icon created: assets\icon.png
exit /b 0
