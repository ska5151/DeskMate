@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [DeskMate] Windows 바탕화면 캐릭터 프로그램을 시작합니다...
if not exist "dist\index.html" (
  echo [DeskMate] 최초 프론트엔드 빌드를 수행합니다...
  call npm run build
)
set USE_DIST_FILE=1
start "" "%~dp0node_modules\electron\dist\electron.exe" .
exit
