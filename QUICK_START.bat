@echo off
chcp 65001 >nul
echo ==========================================
echo    ULTRA_POS 快速啟動嚮導
echo ==========================================
echo.

:: 檢查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未找到 Node.js
    echo 請先安裝 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

:: 檢查 npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 未找到 npm
    echo 請重新安裝 Node.js
    pause
    exit /b 1
)

echo [OK] Node.js 版本:
node --version
echo.

:: 進入專案目錄
cd /d "%~dp0"

:: 檢查 .env 文件
if not exist ".env" (
    echo [提示] 正在創建 .env 文件...
    copy .env.example .env >nul
    echo.
    echo [重要] 請編輯 .env 文件填入您的 API 金鑰:
    echo   1. Supabase URL 和 Key
    echo   2. Gemini API Key (可選)
    echo.
    echo 是否現在編輯? (Y/N)
    set /p edit_env=
    if /i "%edit_env%"=="Y" (
        notepad .env
    )
)

:: 安裝依賴
echo.
echo ==========================================
echo    安裝依賴...
echo ==========================================
call npm install

if %errorlevel% neq 0 (
    echo.
    echo [錯誤] npm install 失敗
    pause
    exit /b 1
)

echo.
echo ==========================================
echo    依賴安裝完成！
echo ==========================================
echo.

:: 詢問是否啟動
echo 是否現在啟動開發服務器? (Y/N)
set /p start_dev=
if /i "%start_dev%"=="Y" (
    echo.
    echo 啟動中... 瀏覽器將自動打開 http://localhost:5173
    echo 按 Ctrl+C 停止服務器
    echo.
    call npm run dev
)

pause
