<#
.SYNOPSIS
    Sends an optional email notification via Gmail SMTP. Silently does nothing if not configured.

.DESCRIPTION
    Shared by the next-item skill (one email per shipped/blocked backlog item, from whichever
    invocation ran it — interactive or headless). See
    docs/backlog-runner.md#email-notifications-optional for setup.

    Reads GMAIL_SENDER_ADDRESS, GMAIL_APP_PASSWORD, and NOTIFY_EMAIL_RECIPIENTS from .env.local
    if they aren't already in the environment. If any of the three end up unset, this is a no-op
    (exit 0) — notifications are opt-in and must never fail a run that didn't ask for them.

.PARAMETER Subject
    Email subject line.

.PARAMETER Body
    Email body. Plain text unless -IsHtml is set.

.PARAMETER BodyFile
    Path to a file holding the email body, read as UTF-8. Use this instead of -Body for HTML
    content, since HTML markup (quotes, angle brackets) is painful to pass as a CLI argument.
    Exactly one of -Body / -BodyFile must be given.

.PARAMETER IsHtml
    Render Body/BodyFile as HTML instead of plain text.

.PARAMETER Attachment
    Optional path to one file to attach. Without it the email is sent exactly as before. A path
    that doesn't exist is an error.
#>

param(
    [Parameter(Mandatory = $true)][string]$Subject,
    [string]$Body,
    [string]$BodyFile,
    [switch]$IsHtml,
    [string]$Attachment
)

if ([string]::IsNullOrEmpty($Body) -eq [string]::IsNullOrEmpty($BodyFile)) {
    Write-Error 'Send-Notification.ps1: pass exactly one of -Body or -BodyFile.'
    exit 1
}
if ($BodyFile) {
    if (-not (Test-Path $BodyFile)) {
        Write-Error "Send-Notification.ps1: -BodyFile not found: $BodyFile"
        exit 1
    }
    $Body = Get-Content -Path $BodyFile -Raw -Encoding UTF8
}

if ($Attachment -and -not (Test-Path -PathType Leaf $Attachment)) {
    Write-Error "Send-Notification.ps1: -Attachment not found: $Attachment"
    exit 1
}

$RepoRoot = Split-Path -Parent $PSScriptRoot

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

if (-not $env:GMAIL_SENDER_ADDRESS -or -not $env:GMAIL_APP_PASSWORD -or -not $env:NOTIFY_EMAIL_RECIPIENTS) {
    exit 0
}
$recipients = $env:NOTIFY_EMAIL_RECIPIENTS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if (-not $recipients) {
    exit 0
}

try {
    $smtp = New-Object System.Net.Mail.SmtpClient('smtp.gmail.com', 587)
    $smtp.EnableSsl = $true
    $smtp.Credentials = New-Object System.Net.NetworkCredential($env:GMAIL_SENDER_ADDRESS, $env:GMAIL_APP_PASSWORD)
    $mail = New-Object System.Net.Mail.MailMessage
    $mail.From = $env:GMAIL_SENDER_ADDRESS
    foreach ($recipient in $recipients) { $mail.To.Add($recipient) }
    $mail.Subject = $Subject
    $mail.Body = $Body
    $mail.IsBodyHtml = $IsHtml.IsPresent
    if ($Attachment) { $mail.Attachments.Add((New-Object System.Net.Mail.Attachment((Resolve-Path $Attachment).Path))) }
    $smtp.Send($mail)
    $mail.Dispose()
} catch {
    Write-Host "Send-Notification.ps1: email notification failed: $_"
}
