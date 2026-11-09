<#
.SYNOPSIS
    Writes a dated, offsite snapshot of this repo (every branch, tag, and commit) to Google Drive.

.DESCRIPTION
    This repo pushes straight to main with no PRs, so these snapshots are the fallback if both
    GitHub and this laptop's clone are lost or damaged. (scripts/git-hooks/pre-push is the other
    half: it blocks deleting or force-pushing main.) See docs/architecture.md "Repo backups".

    Each run writes repbunny-YYYY-MM-DD.bundle (one file, the whole history, checked with
    `git bundle verify`) plus a copy of .env.local, which git doesn't track, into the backup
    folder, then keeps only the newest -Keep of each. A same-day rerun replaces that day's files.
    Runs nightly from the "RepBunny repo backup" scheduled task (-Register sets it up).

    Restore: git clone repbunny-YYYY-MM-DD.bundle repbunny, then in the clone run
    git remote set-url origin https://github.com/DeanPhillipsOKC/repbunny.git and copy the
    matching env file back to .env.local.

    On failure it emails through Send-Notification.ps1 (a no-op if email isn't set up) and
    exits 1.

.PARAMETER Destination
    Backup folder. Default: "RepBunny Backups\repo" under the first "My Drive" found on a drive
    letter (Google Drive for desktop mounts it as G:\My Drive by default).

.PARAMETER Keep
    How many dated snapshots to keep. Default 30.

.PARAMETER Register
    Create or update the nightly scheduled task (9:30 PM, catches up after a missed run), then
    exit without backing up.
#>

param(
    [string]$Destination,
    [int]$Keep = 30,
    [switch]$Register
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$taskName = 'RepBunny repo backup'

if ($Register) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" `
        -WorkingDirectory $repo
    $trigger = New-ScheduledTaskTrigger -Daily -At '9:30 PM'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Nightly git bundle of the RepBunny repo to Google Drive (scripts/Backup-Repo.ps1).' -Force | Out-Null
    Write-Output "Scheduled task '$taskName' registered: daily at 9:30 PM, runs late if the laptop was off."
    exit 0
}

function Fail([string]$message) {
    try {
        & "$PSScriptRoot\Send-Notification.ps1" -Subject 'RepBunny repo backup failed' -Body $message
    } catch {}
    Write-Error $message
    exit 1
}

# Git writes progress and "is okay" to stderr, which PowerShell 5.1 turns into
# terminating errors under 'Stop'. Judge it by exit code instead.
function Invoke-Git {
    $ErrorActionPreference = 'Continue'
    & git -C $repo @args 2>&1 | Out-Null
    return $LASTEXITCODE
}

if (-not $Destination) {
    $drive = Get-PSDrive -PSProvider FileSystem |
        Where-Object { Test-Path (Join-Path $_.Root 'My Drive') } |
        Select-Object -First 1
    if (-not $drive) { Fail 'Google Drive (a "My Drive" folder on any drive letter) was not found. Is Google Drive for desktop running and signed in?' }
    $Destination = Join-Path $drive.Root 'My Drive\RepBunny Backups\repo'
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$date = Get-Date -Format 'yyyy-MM-dd'
$bundle = Join-Path $Destination "repbunny-$date.bundle"
# Built locally first so Drive never syncs a half-written file.
$temp = Join-Path $env:TEMP "repbunny-$date.bundle"

$code = Invoke-Git bundle create $temp --all
if ($code -ne 0) { Fail "git bundle create failed (exit $code)." }
$code = Invoke-Git bundle verify $temp
if ($code -ne 0) { Fail "git bundle verify failed for $temp (exit $code)." }
Move-Item -Force $temp $bundle

$envFile = Join-Path $repo '.env.local'
if (Test-Path $envFile) {
    Copy-Item -Force $envFile (Join-Path $Destination "env-local-$date.txt")
}

foreach ($pattern in 'repbunny-*.bundle', 'env-local-*.txt') {
    Get-ChildItem -Path $Destination -Filter $pattern |
        Sort-Object Name -Descending |
        Select-Object -Skip $Keep |
        Remove-Item -Force
}

$sizeMb = '{0:N1}' -f ((Get-Item $bundle).Length / 1MB)
$head = git -C $repo log -1 --format='%h %s'
Write-Output "Backed up to $bundle ($sizeMb MB), main at $head."
