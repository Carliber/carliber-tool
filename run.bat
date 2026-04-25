@echo off
cd /d "%~dp0"

where node >nul 2>&1 || (
    echo Node.js not found
    pause
    exit /b 1
)

if not exist "dist\index.html" (
    echo Building...
    call npx vite build
    if errorlevel 1 (
        echo Build failed
        pause
        exit /b 1
    )
)

echo Starting Claude Tool...
npx electron .
