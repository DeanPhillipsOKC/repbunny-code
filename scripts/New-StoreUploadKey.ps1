<#
.SYNOPSIS
    Creates the Google Play upload key for the store Android app (#196). Run once, by the owner.

.DESCRIPTION
    1. Generates %USERPROFILE%\.android-keys\repbunny-upload.jks (alias repbunny-upload, RSA
       4096, a random password used for both the store and the key) with the JDK 21 keytool.
    2. Adds the four ANDROID_STORE_* lines to .env.local for scripts/Build-StoreAndroid.ps1.
    3. Sets the GitHub Actions secrets ANDROID_STORE_KEYSTORE_BASE64 and
       ANDROID_STORE_KEYSTORE_PASSWORD for .github/workflows/release-play.yml.

    It never prints the password. Back up the .jks and the password from .env.local afterwards
    (see docs/architecture.md > Native apps > Play releases). Refuses to overwrite an existing key:
    Play App Signing ties uploads to this key, and replacing it means asking Google for a reset.
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$keystore = Join-Path $env:USERPROFILE '.android-keys\repbunny-upload.jks'
$envLocalPath = Join-Path $RepoRoot '.env.local'

if (Test-Path $keystore) { throw "$keystore already exists. Use it, or move it aside first." }
if ((Test-Path $envLocalPath) -and (Select-String -Path $envLocalPath -Pattern '^\s*ANDROID_STORE_' -Quiet)) {
    throw '.env.local already has ANDROID_STORE_* lines. Remove them first.'
}

$jdk = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'jdks') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 not found under %LOCALAPPDATA%\jdks (see docs/architecture.md > Native apps).' }
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }

# Letters and digits only, so it survives .env parsing and shell quoting.
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'

New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
& (Join-Path $jdk.FullName 'bin\keytool.exe') -genkeypair -keystore $keystore -storetype PKCS12 `
    -alias repbunny-upload -keyalg RSA -keysize 4096 -validity 10000 `
    -storepass $password -keypass $password -dname 'CN=RepBunny, C=US'
if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }

Add-Content -Path $envLocalPath -Encoding ascii -Value @(
    '',
    "ANDROID_STORE_KEYSTORE=$keystore",
    "ANDROID_STORE_KEYSTORE_PASSWORD=$password",
    'ANDROID_STORE_KEY_ALIAS=repbunny-upload',
    "ANDROID_STORE_KEY_PASSWORD=$password"
)
Write-Host "Created $keystore and added its settings to .env.local."

# --body, not a pipe: Windows PowerShell appends a newline to piped input, which would end up
# in the password.
& $gh secret set ANDROID_STORE_KEYSTORE_BASE64 --body ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)))
if ($LASTEXITCODE -ne 0) { throw 'Setting ANDROID_STORE_KEYSTORE_BASE64 failed.' }
& $gh secret set ANDROID_STORE_KEYSTORE_PASSWORD --body $password
if ($LASTEXITCODE -ne 0) { throw 'Setting ANDROID_STORE_KEYSTORE_PASSWORD failed.' }
Write-Host 'Set the GitHub secrets ANDROID_STORE_KEYSTORE_BASE64 and ANDROID_STORE_KEYSTORE_PASSWORD.'
Write-Host ''
Write-Host 'Now back it up:'
Write-Host '  - Proton Pass: a Login item "RepBunny Android upload key (Play)", username repbunny-upload,'
Write-Host '    password = ANDROID_STORE_KEYSTORE_PASSWORD from .env.local.'
Write-Host "  - Google Drive: copy $keystore into the RepBunny backups folder."
