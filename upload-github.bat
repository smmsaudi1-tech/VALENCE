@echo off
cd /d "%~dp0"
echo ============================================
echo   VALENCE - GitHub Upload Bot
echo   Repo: https://github.com/smmsaudi1-tech/VALENCE.git
echo ============================================
echo.

git add .
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "update: VALENCE interactive 3D clothes closet rack"
)

set GCM_INTERACTIVE=always
git config --local credential.useHttpPath true
git push -u origin main

echo.
if errorlevel 1 (
    echo [ERROR] Push failed. Make sure you signed in with the right GitHub account.
) else (
    echo [SUCCESS] Uploaded to https://github.com/smmsaudi1-tech/VALENCE.git
)
pause

