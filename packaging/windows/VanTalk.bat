@echo off
setlocal
REM VanTalk desktop launcher (Windows)
cd /d "%~dp0"

where java >nul 2>&1
if errorlevel 1 (
  echo VanTalk requires Java 21+ ^(full JDK recommended for Swing^).
  echo Install OpenJDK 21, ensure java.exe is on PATH, or set JAVA_HOME.
  exit /b 1
)

if not exist "%~dp0vantalk.jar" (
  echo Missing fat jar: %~dp0vantalk.jar
  echo Re-download VanTalk-windows-x64.zip from GitHub Releases.
  exit /b 1
)

REM login_data.json / chat DBs are created in this directory (user.dir)
java -Xms128m -Xmx512m -jar "%~dp0vantalk.jar" %*
exit /b %ERRORLEVEL%
