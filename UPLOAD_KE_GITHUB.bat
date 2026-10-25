@echo off
title Upload MyFinancialFlow V1.1 ke GitHub
color 0A
cd /d "%~dp0"

set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin;%PATH%"

echo ========================================================
echo        UPLOAD MYFINANCIALFLOW V1.1 KE GITHUB
echo ========================================================
echo.
echo Sedang memeriksa autentikasi GitHub...
gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo Silakan login ke GitHub terlebih dahulu. Browser akan dibuka...
    gh auth login --web -h github.com -p https
)

echo.
echo Mengunggah proyek ke GitHub...
git add .
git commit -m "Release: MyFinancialFlow V1.1 with Visible Google Drive Storage & Tamper-Evidence" >nul 2>&1
gh repo create myfinancialflow-v1.1 --public --source=. --remote=origin --push

echo.
echo ========================================================
echo Selesai! Proyek Anda sudah terupload ke GitHub:
echo https://github.com/pranjiunggul/myfinancialflow-v1.1
echo ========================================================
pause
