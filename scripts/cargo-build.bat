@echo off
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d c:\Users\MY-PC\Music\MotionDeck\src-tauri
cargo build
