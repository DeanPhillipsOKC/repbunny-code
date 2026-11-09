<#
.SYNOPSIS
    Builds the store Android app (RepBunny, app.repbunny) as a signed Android App Bundle for
    Google Play (#196).

.DESCRIPTION
    1. Reads the Play upload key from .env.local (ANDROID_STORE_KEYSTORE,
       ANDROID_STORE_KEYSTORE_PASSWORD, ANDROID_STORE_KEY_ALIAS, ANDROID_STORE_KEY_PASSWORD).
       scripts/New-StoreUploadKey.ps1 creates them.
    2. Refuses to build if VITE_PREMIUM_UNLOCKED, VITE_DEV_TOOLS, or VITE_E2E_HOOKS is set anywhere
       Vite would read it: store builds sell Premium, they never unlock it, show the dev switch,
       or carry the e2e test hooks.
    3. Builds the web app, syncs it into android/, and runs bundleStoreRelease on JDK 21.
    4. Checks the bundle is signed and copies it to repbunny-<versionName>-<versionCode>.aab.

    Uploading is the job of .github/workflows/release-play.yml, which runs this script with
    the minutes since 2026-01-01 UTC as the versionCode. Local runs are for checking the build; Play
    rejects a versionCode it has already seen, so don't upload a local bundle by hand.

.PARAMETER VersionCode
    Play's internal build number. Must rise with every upload. Defaults to 1 for local builds.

.PARAMETER VersionName
    The version users see. Defaults to the iPhone app's MARKETING_VERSION so both stores match.
#>

param(
    [int]$VersionCode = 1,
    [string]$VersionName
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$envLocalPath = Join-Path $RepoRoot '.env.local'
if (Test-Path $envLocalPath) {
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name, $value = $matches[1], $matches[2]
            if (-not (Test-Path "Env:$name")) {
                Set-Item -Path "Env:$name" -Value $value
            }
        }
    }
}

# Vite reads these files for a production build, so a stray line in any of them would ship
# Premium unlocked (or the test hooks) to everyone.
foreach ($var in 'VITE_PREMIUM_UNLOCKED', 'VITE_DEV_TOOLS', 'VITE_E2E_HOOKS') {
    if (Test-Path "Env:$var") { throw "$var is set; store builds must not unlock Premium, show the dev switch, or carry the e2e test hooks." }
    foreach ($file in '.env', '.env.local', '.env.production', '.env.production.local') {
        $path = Join-Path $RepoRoot $file
        if ((Test-Path $path) -and (Select-String -Path $path -Pattern "^\s*$var\s*=" -Quiet)) {
            throw "$file sets $var; store builds must not unlock Premium, show the dev switch, or carry the e2e test hooks."
        }
    }
}

foreach ($name in 'ANDROID_STORE_KEYSTORE', 'ANDROID_STORE_KEYSTORE_PASSWORD',
    'ANDROID_STORE_KEY_ALIAS', 'ANDROID_STORE_KEY_PASSWORD') {
    if (-not (Test-Path "Env:$name")) { throw "$name is missing from .env.local. Run scripts/New-StoreUploadKey.ps1 or restore the key from its backup." }
}
if (-not (Test-Path $env:ANDROID_STORE_KEYSTORE)) {
    throw "Upload keystore not found at $env:ANDROID_STORE_KEYSTORE. Restore it from its Proton Pass backup."
}

if (-not $VersionName) {
    $pbxproj = Get-Content (Join-Path $RepoRoot 'ios/App/App.xcodeproj/project.pbxproj') -Raw
    if ($pbxproj -notmatch 'MARKETING_VERSION = ([0-9.]+);') { throw "Couldn't read MARKETING_VERSION from the iOS project; pass -VersionName." }
    $VersionName = $matches[1]
}

# Android Studio's bundled Java 25 can't run this Gradle, so prefer the portable JDK 21.
$onWindows = $env:OS -eq 'Windows_NT'
$jdk = if ($env:LOCALAPPDATA) {
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'jdks') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
elseif (-not $env:JAVA_HOME) { throw 'JDK 21 not found under %LOCALAPPDATA%\jdks (see docs/architecture.md > Native apps).' }

Write-Host "Building RepBunny $VersionName ($VersionCode) from $((git rev-parse --short HEAD))"

npm run android:sync
if ($LASTEXITCODE -ne 0) { throw 'Web build or cap sync failed.' }

Push-Location android
try {
    $gradlew = if ($onWindows) { '.\gradlew.bat' } else { './gradlew' }
    & $gradlew bundleStoreRelease "-PversionCode=$VersionCode" "-PversionName=$VersionName"
    if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
} finally {
    Pop-Location
}

$built = 'android/app/build/outputs/bundle/storeRelease/app-store-release.aab'
if (-not (Test-Path $built)) { throw "No bundle at $built." }
$jarsigner = Join-Path $env:JAVA_HOME ('bin/jarsigner' + $(if ($onWindows) { '.exe' } else { '' }))
$verify = & $jarsigner -verify $built
if ($LASTEXITCODE -ne 0 -or -not ($verify -match 'jar verified')) {
    throw "$built is not signed. Is the store signing config being picked up?"
}
$aab = "android/app/build/outputs/bundle/storeRelease/repbunny-$VersionName-$VersionCode.aab"
Copy-Item $built $aab -Force
Write-Host "Signed bundle: $aab"
if ($env:GITHUB_OUTPUT) { "aab=$aab" | Add-Content $env:GITHUB_OUTPUT }
