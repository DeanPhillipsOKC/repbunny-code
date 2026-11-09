<#
.SYNOPSIS
    Builds the personal Android app (RepBunny (Dev), app.repbunny.personal), signs it, and
    publishes it as a GitHub release in a private repo for Obtainium (#68): the backlog repo, so
    the source Obtainium reads stays the same when the code moves to a public repo (#946).

.DESCRIPTION
    1. Reads the signing key from .env.local (ANDROID_PERSONAL_KEYSTORE,
       ANDROID_PERSONAL_KEYSTORE_PASSWORD, ANDROID_PERSONAL_KEY_ALIAS,
       ANDROID_PERSONAL_KEY_PASSWORD).
    2. Picks the next versionCode from the latest release tag, so no file changes per
       release. Tag and versionName are 1.0.<versionCode>; the tag marks the built commit.
    3. Builds the web app with VITE_PREMIUM_UNLOCKED=true and VITE_DEV_TOOLS=true (this build only; store builds
       never set it), syncs it into android/, and runs assemblePersonalRelease on JDK 21.
    4. Creates the GitHub release with the APK attached. Notes list the commits since the
       previous release.

    Runs on Windows (JDK 21 from %LOCALAPPDATA%\jdks) and in GitHub Actions
    (.github/workflows/release-android.yml, which sets JAVA_HOME, GH_TOKEN, and the signing
    variables from secrets).

    Publishing uses the gh CLI's login (or RELEASE_GH_TOKEN). The release repo must be private:
    anyone who can see it can download the premium-unlocked APK, so the script refuses to publish
    to a public one.

.PARAMETER AllowDirty
    Build even with uncommitted changes. The release notes say so.

.PARAMETER SkipPublish
    Build and sign only; leave the APK in android/app/build/outputs/apk/personal/release/.

.PARAMETER SkipIfUnchanged
    Exit without building when the latest release was already built from HEAD (nightly runs).
#>

param(
    [switch]$AllowDirty,
    [switch]$SkipPublish,
    [switch]$SkipIfUnchanged
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

foreach ($name in 'ANDROID_PERSONAL_KEYSTORE', 'ANDROID_PERSONAL_KEYSTORE_PASSWORD',
    'ANDROID_PERSONAL_KEY_ALIAS', 'ANDROID_PERSONAL_KEY_PASSWORD') {
    if (-not (Test-Path "Env:$name")) { throw "$name is missing from .env.local." }
}
if (-not (Test-Path $env:ANDROID_PERSONAL_KEYSTORE)) {
    throw "Keystore not found at $env:ANDROID_PERSONAL_KEYSTORE. Restore it from its Proton Pass backup."
}

$onWindows = $env:OS -eq 'Windows_NT'
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh -and $onWindows) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
# #946: releases go to a private repo that may not be the code repo. Once the code is public
# (repbunny-code), they stay in the private backlog repo, so Obtainium's source never changes.
# RELEASE_REPO overrides; otherwise BACKLOG_REPO, otherwise the backlog default. RELEASE_GH_TOKEN
# is a token that can write there (release-android.yml passes the Builder token); locally gh's own
# login does.
$Repo = if ($env:RELEASE_REPO) { $env:RELEASE_REPO.Trim() }
    elseif ($env:BACKLOG_REPO) { $env:BACKLOG_REPO.Trim() }
    else { 'DeanPhillipsOKC/repbunny' }
$codeToken = $env:GH_TOKEN
if ($env:RELEASE_GH_TOKEN) { $env:GH_TOKEN = $env:RELEASE_GH_TOKEN }
$repoInfo = & $gh repo view $Repo --json nameWithOwner,visibility | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Couldn't read $Repo's GitHub details." }
if ($repoInfo.visibility -ne 'PRIVATE' -and -not $SkipPublish) {
    throw "$($repoInfo.nameWithOwner) is $($repoInfo.visibility). Releases here would be public; make it private first."
}
$Repo = $repoInfo.nameWithOwner

$dirty = [bool](git status --porcelain)
if ($dirty -and -not $AllowDirty) { throw 'Uncommitted changes. Commit first, or pass -AllowDirty.' }
$commit = git rev-parse HEAD
$tree = git rev-parse "HEAD^{tree}"

# Next versionCode = the latest release's + 1 (tags are v1.0.<versionCode>).
$lastTag = & $gh release list -R $Repo --limit 1 --exclude-drafts --json tagName --jq '.[0].tagName'
if ($LASTEXITCODE -ne 0) { throw "Couldn't list releases in $Repo." }
# What the last release was built from. Its notes carry hidden `source:` and `tree:` markers (#946),
# because its tag may sit in a different repo from the code. Older releases have no markers; their
# tag points at the built commit, so its tree comes from the API and the commit is used if this
# checkout has it.
$lastSource = $null
$lastTree = $null
if ($lastTag) {
    $last = & $gh release view $lastTag -R $Repo --json body,targetCommitish | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Couldn't read release $lastTag in $Repo." }
    if ($last.body -match '<!-- source: ([0-9a-f]{40}) -->') { $lastSource = $matches[1] }
    if ($last.body -match '<!-- tree: ([0-9a-f]{40}) -->') { $lastTree = $matches[1] }
    if (-not $lastTree) {
        $lastTree = & $gh api "repos/$Repo/commits/$($last.targetCommitish)" --jq '.commit.tree.sha' 2>$null
        if ($LASTEXITCODE -ne 0) { $lastTree = $null }
        if (-not $lastSource) { $lastSource = $last.targetCommitish }
    }
    # Only a commit this checkout has can give a change list.
    if ($lastSource) {
        git cat-file -e "$lastSource^{commit}" 2>$null
        if ($LASTEXITCODE -ne 0) { $lastSource = $null }
        $global:LASTEXITCODE = 0
    }
    if ($SkipIfUnchanged -and -not $dirty -and $lastTree -eq $tree) {
        Write-Host "$lastTag was already built from these files ($($commit.Substring(0, 7))); nothing to release."
        return
    }
}

# Android Studio's bundled Java 25 can't run this Gradle, so prefer the portable JDK 21.
$jdk = if ($env:LOCALAPPDATA) {
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'jdks') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
elseif (-not $env:JAVA_HOME) { throw 'JDK 21 not found under %LOCALAPPDATA%\jdks (see docs/architecture.md > Native apps).' }
$lastCode = 0
if ($lastTag -match '^v1\.0\.(\d+)$') { $lastCode = [int]$matches[1] }
$versionCode = $lastCode + 1
$versionName = "1.0.$versionCode"
Write-Host "Building RepBunny (Dev) $versionName from $($commit.Substring(0, 7))"

$env:VITE_PREMIUM_UNLOCKED = 'true'
$env:VITE_DEV_TOOLS = 'true'
npm run android:sync
if ($LASTEXITCODE -ne 0) { throw 'Web build or cap sync failed.' }
Remove-Item Env:VITE_PREMIUM_UNLOCKED
Remove-Item Env:VITE_DEV_TOOLS

Push-Location android
try {
    $gradlew = if ($onWindows) { '.\gradlew.bat' } else { './gradlew' }
    & $gradlew assemblePersonalRelease "-PversionCode=$versionCode" "-PversionName=$versionName"
    if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
} finally {
    Pop-Location
}

$built = 'android/app/build/outputs/apk/personal/release/app-personal-release.apk'
if (-not (Test-Path $built)) { throw "No signed APK at $built. Is the signing config being picked up?" }
$apk = "android/app/build/outputs/apk/personal/release/repbunny-dev-$versionName.apk"
Copy-Item $built $apk -Force
Write-Host "Signed APK: $apk"

if ($SkipPublish) { return }

# The notes name the built commit, so GitHub has to have it.
if (-not (git branch -r --contains $commit)) { throw 'HEAD is not pushed. Push first, then re-run.' }
$codeRepo = (node scripts/code-repo.mjs).Trim()

# Notes: commits since the previous release's source, plus hidden markers for the next run.
$notes = "Built from $($commit.Substring(0, 7))"
if ($codeRepo -ne $Repo) { $notes += " in $codeRepo" }
$notes += '.'
if ($dirty) { $notes += ' Includes uncommitted changes.' }
if ($lastSource) {
    $log = git log --format='- %s' "$lastSource..$commit" 2>$null
    if ($LASTEXITCODE -eq 0 -and $log) { $notes += "`n`nChanges:`n" + ($log -join "`n") }
}
$notes += "`n`n<!-- source: $commit -->`n<!-- tree: $tree -->"

# The tag marks the built commit when the release repo is the code repo; otherwise that commit
# isn't in the release repo, so the tag goes on its default branch and the notes name the source.
$target = if ($codeRepo -eq $Repo) { @('--target', $commit) } else { @() }
& $gh release create "v$versionName" $apk -R $Repo @target --title "RepBunny (Dev) $versionName" --notes $notes
if ($LASTEXITCODE -ne 0) { throw 'Creating the GitHub release failed.' }
Write-Host "Released v$versionName to $Repo. Obtainium will pick it up on its next check."

# Owner check (docs/backlog.md): tell each issue waiting on the owner (`status:verify`) which build
# has it. Commit subjects name it as "(<backlog repo>#<issue>)" (bare "(#<issue>)" before #946); a PR number never carries
# the label, so checking every number is enough. Each commit is in one release's range, so each
# issue hears once. A failure here never fails the release.
$env:GH_TOKEN = $codeToken
if ($lastSource) {
    # Issues live in the backlog repo (#944, scripts/backlog-repo.mjs); the release stays in $Repo.
    $BacklogRepo = if ($env:BACKLOG_REPO) { $env:BACKLOG_REPO.Trim() } else { 'DeanPhillipsOKC/repbunny' }
    # release-android.yml passes a token that can reach the backlog repo; locally gh's own login does.
    $releaseToken = $env:GH_TOKEN
    if ($env:BACKLOG_GH_TOKEN) { $env:GH_TOKEN = $env:BACKLOG_GH_TOKEN }
    # Which numbers name a backlog issue: scripts/backlog-repo.mjs > subjectIssueNumbers (#946).
    $numbers = git log --format='%s' "$lastSource..$commit" 2>$null |
        node scripts/backlog-repo.mjs --subject-issues | Sort-Object -Unique
    foreach ($n in $numbers) {
        $labels = & $gh api "repos/$BacklogRepo/issues/$n" --jq 'select(.state == "open") | .labels[].name' 2>$null
        if ($LASTEXITCODE -ne 0 -or -not ($labels -contains 'status:verify')) { continue }
        $body = "Ready to test in **RepBunny (Dev) $versionName** (Obtainium: refresh RepBunny (Dev), then update). Release: https://github.com/$Repo/releases/tag/v$versionName"
        & $gh issue comment $n -R $BacklogRepo --body $body 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "Told #$n it's in $versionName." }
        else { Write-Warning "Couldn't comment on #$n." }
    }
    $env:GH_TOKEN = $releaseToken
    # A PR number's lookup fails (the workflow token has no pull-requests scope), and Actions' pwsh
    # step ends with `exit $LASTEXITCODE`, so a skipped number would fail the step (#934).
    $global:LASTEXITCODE = 0
}
