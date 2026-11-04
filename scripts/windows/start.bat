@echo off
title Gift Jar Overlay
cd /d "%~dp0"
set TIKTOK_USERNAME=ennieiuoiw
echo Dang khoi dong Gift Jar... Dung dong cua so nay khi dang livestream.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:8787/"
"node\node.exe" server\src\index.js
echo.
echo Chuong trinh da dung. Neu thay loi o tren, hay chup man hinh gui cho nguoi ho tro.
pause
