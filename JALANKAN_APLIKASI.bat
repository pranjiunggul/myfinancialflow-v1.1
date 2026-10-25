@echo off
title FinanceFlow - Aplikasi Keuangan Pribadi
color 0A

:: Masuk ke direktori aplikasi
cd /d "%~dp0"

echo ========================================================
echo        MEMULAI APLIKASI FINANCEFLOW
echo ========================================================
echo.
echo Sedang menyiapkan server...
echo Browser web Anda akan terbuka secara otomatis!
echo.
echo Port yang digunakan: 3000
echo (Jika port 3000 terpakai, sistem akan otomatis memilih port berikutnya)
echo.
echo PERHATIAN:
echo Jangan tutup jendela hitam ini selama menggunakan aplikasi.
echo Untuk menutup aplikasi, cukup tutup jendela ini atau tekan Ctrl + C.
echo ========================================================
echo.

call npm.cmd run dev

pause
