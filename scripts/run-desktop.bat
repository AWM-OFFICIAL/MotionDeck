@echo off
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo
where link
where cl
cd /d c:\Users\MY-PC\Music\MotionDeck

netstat -ano | findstr ":1420" | findstr "LISTENING" >nul
if %ERRORLEVEL%==0 (
  echo Vite is already on port 1420 — opening the desktop window against it.
  npx tauri dev --config src-tauri/tauri.attach.json
) else (
  npm run desktop
)
