@echo off
cd /d "%~dp0"

:: Add mise node to PATH if not already available
where node >nul 2>&1 || (
    for /f "delims=" %%i in ('dir /b /ad /o-n "%LOCALAPPDATA%\mise\installs\node" 2^>nul') do (
        set "MISE_NODE=%LOCALAPPDATA%\mise\installs\node\%%i"
        goto :found_node
    )
    echo Node.js not found. Install from https://nodejs.org or via mise
    pause
    exit /b 1
    :found_node
    set "PATH=%MISE_NODE%;%PATH%"
)

where node >nul 2>&1 || (
    echo Node.js not found after PATH adjustment.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Install failed
        pause
        exit /b 1
    )
)

if "%~1"=="dev" goto dev
goto prod

:dev
echo Starting Claude Tool (dev mode)...
call npm run dev
goto end

:prod
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

:end
