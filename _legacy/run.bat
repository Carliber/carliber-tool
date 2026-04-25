@echo off
set "JAVA_HOME=D:\Program\Java\jdk-21"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%~dp0"
call "D:\work\program\apache-maven-3.8.8\bin\mvn.cmd" compile
if errorlevel 1 (
    echo Compile failed
    pause
    exit /b 1
)
call "D:\work\program\apache-maven-3.8.8\bin\mvn.cmd" javafx:run
pause
