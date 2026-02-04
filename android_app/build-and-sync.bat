@echo off
echo ============================================
echo  InkLogic - Build and Sync for Android
echo ============================================
echo.
echo IMPORTANT: Make sure Android Studio is CLOSED!
echo Press any key to continue or Ctrl+C to cancel...
pause >nul
echo.

echo [1/5] Building web assets...
cd /d "%~dp0"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build web assets
    pause
    exit /b 1
)
echo.

echo [2/5] Stopping Gradle daemons...
cd android
call gradlew --stop
timeout /t 2 /nobreak >nul
echo.

echo [3/5] Syncing to Android...
cd ..
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to sync. Make sure Android Studio is completely closed!
    echo Try closing Android Studio and run this script again.
    pause
    exit /b 1
)
echo.

echo [4/5] Cleaning Android build...
cd android
call gradlew clean
echo.

echo [5/5] Building Android APK...
call gradlew assembleDebug
echo.

if %ERRORLEVEL% EQU 0 (
    echo ============================================
    echo  SUCCESS! 
    echo ============================================
    echo.
    echo APK location: android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo You can now:
    echo 1. Open Android Studio and click Run
    echo 2. Or install the APK manually with:
    echo    adb install android\app\build\outputs\apk\debug\app-debug.apk
    echo.
) else (
    echo ============================================
    echo  BUILD FAILED
    echo ============================================
    echo Run android\fix-build.bat and try again
    echo.
)

pause
