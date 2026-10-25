@echo off
title Deploy FinanceFlow ke Vercel
color 0B
cd /d "%~dp0"

echo ========================================================
echo        UPDATE DEPLOY FINANCEFLOW KE VERCEL
echo ========================================================
echo.
echo Sedang membangun versi terbaru dan mengunggah ke Vercel...
echo.

call npm.cmd run build
call npx.cmd vercel --prod --yes

echo.
echo ========================================================
echo Deploy berhasil! Aplikasi Anda sudah diperbarui di:
echo https://financeflow-pwa.vercel.app
echo ========================================================
pause
