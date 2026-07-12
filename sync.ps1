# Automated Sync Script for Smurf Village Registry
# Enforces clasp push and git push on file changes

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Smurf Village Auto-Sync & Deploy" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Watching directory: $PSScriptRoot" -ForegroundColor Yellow

# Ensure clasp and git are ready
if (-not (Test-Path ".clasp.json")) {
    Write-Error "Error: .clasp.json not found! Please make sure it is configured."
    exit
}

# Load clasp settings to check scriptId
$claspConfig = Get-Content ".clasp.json" | ConvertFrom-Json
if ($claspConfig.scriptId -eq "YOUR_SCRIPT_ID_HERE") {
    Write-Host "WARNING: .clasp.json still contains the placeholder scriptId!" -ForegroundColor Red
    Write-Host "Please update .clasp.json with your actual Google Apps Script Script ID." -ForegroundColor Red
} else {
    Write-Host "Target Google Apps Script ID: $($claspConfig.scriptId)" -ForegroundColor Green
}

# Watcher setup
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $PSScriptRoot
# Watch for html, js, md and json files
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$lastRun = [DateTime]::MinValue
$throttleSeconds = 3 # Debounce interval

$onChange = Register-ObjectEvent $watcher "Changed" -Action {
    $filePath = $Event.SourceEventArgs.FullPath
    $fileName = $Event.SourceEventArgs.Name
    
    # Ignore git and temp directories
    if ($filePath -like "*\.git\*" -or $filePath -like "*\node_modules\*" -or $fileName -eq ".clasp.json" -or $fileName -eq "sync.ps1") {
        return
    }
    
    # Debounce checks
    $now = Get-Date
    if (($now - $lastRun).TotalSeconds -lt $throttleSeconds) {
        return
    }
    $global:lastRun = $now
    
    Write-Host ""
    Write-Host "Change detected: $fileName ($now)" -ForegroundColor Magenta
    
    # 1. Run Clasp Push for Apps Script if files in gas/ directory change
    if ($filePath -like "*\gas\*") {
        Write-Host "Executing clasp push..." -ForegroundColor Yellow
        try {
            npx @google/clasp push -f
            Write-Host "GAS Deploy successful!" -ForegroundColor Green
        } catch {
            Write-Host "GAS Deploy failed: $_" -ForegroundColor Red
        }
    }
    
    # 2. Run Git Push to repository
    Write-Host "Executing git push..." -ForegroundColor Yellow
    try {
        git add .
        git commit -m "Auto sync: $fileName - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git push
        Write-Host "Git Push successful!" -ForegroundColor Green
    } catch {
        Write-Host "Git Push failed: $_" -ForegroundColor Red
    }
}

Write-Host "Watcher is running. Press Ctrl+C to stop." -ForegroundColor Green

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Cleanup event subscription on exit
    Unregister-Event -SourceIdentifier $onChange.Name
    $watcher.Dispose()
    Write-Host "Watcher stopped." -ForegroundColor Yellow
}
