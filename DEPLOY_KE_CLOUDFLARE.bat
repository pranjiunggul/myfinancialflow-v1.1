@echo off
title Deploy MyFinancialFlow V1.1 ke Cloudflare Pages
color 0B
cd /d "%~dp0"

echo ========================================================
echo   UPDATE DEPLOY MYFINANCIALFLOW V1.1 KE CLOUDFLARE PAGES
echo ========================================================
echo.
echo Sedang mengompilasi dan mengunggah ke Cloudflare Pages...
echo Target Project: financeflow-pwa (Data Continuity Preserved)
echo.

call npm.cmd run build
call npx.cmd wrangler pages deploy dist --project-name financeflow-pwa

echo.
echo ========================================================
echo Deploy berhasil! Aplikasi Anda aktif di Cloudflare Pages:
echo https://financeflow-pwa.pages.dev
echo ========================================================
pause
