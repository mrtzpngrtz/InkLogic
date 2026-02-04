# Force Sync - Handles file locks more aggressively
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " InkLogic - Force Sync to Android" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Android Studio is running
$asProcess = Get-Process | Where-Object {$_.ProcessName -like "*studio*" -or $_.ProcessName -like "*java*" -and $_.Path -like "*Android*"}
if ($asProcess) {
    Write-Host "WARNING: Android Studio or related processes are running!" -ForegroundColor Yellow
    Write-Host "Found processes:" -ForegroundColor Yellow
    $asProcess | ForEach-Object { Write-Host "  - $($_.ProcessName)" -ForegroundColor Yellow }
    Write-Host ""
    $continue = Read-Host "Do you want to try anyway? (y/n)"
    if ($continue -ne 'y') {
        Write-Host "Cancelled. Please close Android Studio and try again." -ForegroundColor Red
        exit
    }
}

Write-Host "[1/4] Stopping Gradle processes..." -ForegroundColor Green
Set-Location android
& .\gradlew.bat --stop | Out-Null
Start-Sleep -Seconds 2

# Kill any remaining Java processes from Gradle
$gradleProcesses = Get-Process -Name "java" -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "*gradle*"}
if ($gradleProcesses) {
    Write-Host "Killing remaining Gradle processes..." -ForegroundColor Yellow
    $gradleProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
}

Set-Location ..
Write-Host ""

Write-Host "[2/4] Removing locked directories..." -ForegroundColor Green
$dirs = @(
    "android\app\src\main\assets\public",
    "android\capacitor-cordova-android-plugins\src\main\res"
)

foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Write-Host "  Removing $dir..." -ForegroundColor Gray
        try {
            # Try normal removal first
            Remove-Item -Path $dir -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Host "    Normal removal failed, trying alternative method..." -ForegroundColor Yellow
            # Try using cmd rmdir which sometimes works better
            cmd /c "rmdir /s /q `"$dir`"" 2>$null
            Start-Sleep -Milliseconds 500
            
            # If still exists, try takeown and icacls
            if (Test-Path $dir) {
                Write-Host "    Taking ownership..." -ForegroundColor Yellow
                cmd /c "takeown /f `"$dir`" /r /d y" 2>$null | Out-Null
                cmd /c "icacls `"$dir`" /grant administrators:F /t" 2>$null | Out-Null
                Start-Sleep -Milliseconds 500
                cmd /c "rmdir /s /q `"$dir`"" 2>$null
            }
        }
        
        if (Test-Path $dir) {
            Write-Host "    WARNING: Could not remove $dir" -ForegroundColor Red
        } else {
            Write-Host "    ✓ Removed" -ForegroundColor Green
        }
    }
}
Write-Host ""

Write-Host "[3/4] Copying web assets manually..." -ForegroundColor Green
$sourceDir = "dist"
$destDir = "android\app\src\main\assets\public"

# Create destination directory
New-Item -Path $destDir -ItemType Directory -Force | Out-Null

# Copy files
Write-Host "  Copying from dist to Android..." -ForegroundColor Gray
Copy-Item -Path "$sourceDir\*" -Destination $destDir -Recurse -Force
Write-Host "  ✓ Web assets copied" -ForegroundColor Green
Write-Host ""

Write-Host "[4/4] Running Capacitor update..." -ForegroundColor Green
try {
    npx cap update android 2>&1 | Out-String | Write-Host
} catch {
    Write-Host "Cap update had issues, but web assets are copied manually" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Sync Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Android Studio" -ForegroundColor White
Write-Host "2. File -> Sync Project with Gradle Files" -ForegroundColor White
Write-Host "3. Click Run button" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to close"
