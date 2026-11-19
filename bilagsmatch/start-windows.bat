@echo off
rem Bilagsmatch - double-click to start. First start takes a few minutes.
cd /d "%~dp0"
title Bilagsmatch

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js mangler. Installer "LTS" fra https://nodejs.org og dobbeltklik paa denne fil igen.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/4] Installerer ^(foerste gang, kraever internet^)...
  call npm install || goto :fail
)
if not exist .env (
  copy .env.example .env >nul
)
if not exist prisma\dev.db (
  echo [2/4] Opretter database med demo-data...
  call npx prisma migrate deploy || goto :fail
  call npm run db:seed || goto :fail
)
if not exist .next\BUILD_ID (
  echo [3/4] Bygger appen...
  call npm run build || goto :fail
)
echo [4/4] Starter Bilagsmatch paa http://localhost:3000
echo Log ind: demo@bilagsmatch.dk / demo1234
echo Luk dette vindue for at stoppe appen.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
call npm run start
goto :eof

:fail
echo.
echo Noget gik galt. Se fejlen ovenfor.
pause
exit /b 1
