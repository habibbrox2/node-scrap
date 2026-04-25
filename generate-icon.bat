@echo off
REM Generate a simple PNG icon for Brox Scraper

echo Creating icon...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"^
[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; ^
$png = New-Object System.Drawing.Bitmap(256, 256); ^
$graphics = [System.Drawing.Graphics]::FromImage($png); ^
$graphics.Clear([System.Drawing.Color]::White); ^
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 152, 219)); ^
$font = New-Object System.Drawing.Font('Arial', 100, [System.Drawing.FontStyle]::Bold); ^
$graphics.FillEllipse($brush, 10, 10, 236, 236); ^
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White); ^
$format = New-Object System.Drawing.StringFormat; ^
$format.Alignment = [System.Drawing.StringAlignment]::Center; ^
$format.LineAlignment = [System.Drawing.StringAlignment]::Center; ^
$graphics.DrawString('B', $font, $textBrush, [System.Drawing.Rectangle]::new(0, 20, 256, 200), $format); ^
$png.Save('assets/icon.png', [System.Drawing.Imaging.ImageFormat]::Png); ^
$graphics.Dispose(); ^
$png.Dispose(); ^
Write-Host 'Icon created: assets/icon.png'; ^
"

if errorlevel 1 (
    echo Failed to create icon.
    echo You can manually replace assets/icon.png with your own 256x256 PNG file.
)

pause
