import { Capacitor } from '@capacitor/core'
import type { ClientErrorEntry } from '../data/types'

// Issue #84: "Report a bug" in the Account sheet. The user picks which logged
// errors (src/lib/errorLog.ts) to include, and Send opens their email app
// already addressed to SUPPORT_EMAIL with the report filled in. They still
// tap Send there: nothing leaves the device without them, and sending doesn't
// touch the log.

// The address the support page (site/support/) and privacy policy list.
export const SUPPORT_EMAIL = 'hello@repbunny.app'

export type LoggedError = ClientErrorEntry & { id: string }

export interface BugReportInput {
  description: string
  errors: LoggedError[]
  appVersion: string | null
  now?: Date
  // Stacks are the bulk of a report; a mailto: body drops them first.
  includeStacks?: boolean
  // "Email me when it's fixed", off unless checked. We reply to every report
  // either way; this only allows a later note when the fix ships.
  followUp?: boolean
}

// First in the report, so a trimmed mailto: body always keeps it;
// triage-support reads it.
export function followUpLine(followUp = false): string {
  return `Email me when it's fixed: ${followUp ? 'yes' : 'no'}`
}

const DAY_MS = 24 * 60 * 60 * 1000

export function isRecent(error: LoggedError, now = new Date()): boolean {
  return now.getTime() - new Date(error.occurred_at).getTime() < DAY_MS
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// "Today 6:42 PM", "Yesterday 6:42 PM", or "Sep 30, 6:42 PM", in local time.
export function formatErrorTime(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  const date = at.toLocaleDateString([], { month: 'short', day: 'numeric', year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
  return `${date}, ${time}`
}

// "/progress/workouts" reads as "Progress"; "/" is Home.
export function screenName(route: string | null): string {
  if (!route) return 'Unknown screen'
  const first = route.split(/[?#]/)[0].split('/').filter(Boolean)[0]
  if (!first) return 'Home'
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ')
}

export function firstLine(message: string): string {
  return message.split('\n')[0]
}

function platformName(): string {
  const platform = Capacitor.getPlatform()
  if (platform !== 'web') return platform === 'ios' ? 'iPhone app' : platform === 'android' ? 'Android app' : platform
  return 'Web app (browser)'
}

// Issue #234: OS and model come from the user agent, so no native plugin is
// needed. iOS doesn't name the model past "iPhone"/"iPad"; Chrome's reduced
// user agent on Android may say "K".
export function osName(ua: string): string {
  const ios = ua.match(/(?:iPhone|CPU) OS (\d+(?:_\d+)*)/)
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`
  const android = ua.match(/Android (\d+(?:\.\d+)*)/)
  if (android) return `Android ${android[1]}`
  if (/Windows NT/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'unknown'
}

export function deviceModel(ua: string): string {
  const apple = ua.match(/\((iPhone|iPad|iPod)/)
  if (apple) return apple[1]
  const android = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/)
  if (android) return android[1].trim()
  return 'unknown'
}

// "v142+a1b2c3d" (scripts/lib/build-version.mjs) is build 142.
export function buildNumber(appVersion: string | null): string {
  return appVersion?.match(/^v(\d+)/)?.[1] ?? 'unknown'
}


// The header lines every support email carries, bug report or idea.
function deviceLines(appVersion: string | null, now: Date): string[] {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return [
    `App version: ${appVersion ?? 'unknown'}`,
    `Build: ${buildNumber(appVersion)}`,
    `Platform: ${platformName()}`,
    `OS: ${osName(ua)}`,
    `Device model: ${deviceModel(ua)}`,
    // Issue #938: the data is only ever on the device.
    'Storage: On this device',
    `Device: ${ua || 'unknown'}`,
    `Created: ${now.toISOString()}`,
  ]
}

// Issue #234: the steps the action trail (src/lib/actionTrail.ts) recorded
// before an error, oldest first.
export function trailOf(error: LoggedError): string[] {
  const trail = error.context?.trail
  return Array.isArray(trail) ? trail.filter((s): s is string => typeof s === 'string') : []
}

// Issue #574: the description a "This looks wrong" link pre-fills, so every
// receipt words it the same way. Empty parts are left out.
export interface NumberReportInput {
  screen: string
  shown: string
  from?: string
  rule?: string
  unit?: string
  extra?: string[]
}

export function numberReportText({ screen, shown, from, rule, unit, extra = [] }: NumberReportInput): string {
  const lines = ['A number looks wrong.', `Screen: ${screen}`, `Shown: ${shown}`]
  if (from) lines.push(`Worked out from: ${from}`)
  if (rule) lines.push(`Rule: ${rule}`)
  lines.push(...extra)
  if (unit) lines.push(`Unit: ${unit}`)
  lines.push('', 'What did you expect?', '')
  return lines.join('\n')
}

export function buildBugReport({ description, errors, appVersion, now = new Date(), includeStacks = true, followUp }: BugReportInput): string {
  const lines = [
    'RepBunny bug report',
    '',
    followUpLine(followUp),
    '',
    'What happened:',
    description.trim() || '(no description)',
    '',
    ...deviceLines(appVersion, now),
    '',
    errors.length ? `Errors (${errors.length}):` : 'Errors: none included',
  ]
  errors.forEach((error, index) => {
    lines.push(
      '',
      `${index + 1}. ${error.occurred_at} (${error.kind})`,
      `Screen: ${error.route ?? 'unknown'}`,
      `Message: ${error.message}`,
    )
    if (error.app_version && error.app_version !== appVersion) lines.push(`App version then: ${error.app_version}`)
    const { trail: _trail, ...context } = error.context ?? {}
    if (Object.keys(context).length) lines.push(`Context: ${JSON.stringify(context)}`)
    const steps = trailOf(error)
    if (steps.length) lines.push('Steps before it:', ...steps.map((step, i) => `  ${i + 1}. ${step}`))
    if (error.stack && includeStacks) lines.push('Stack:', error.stack)
  })
  return lines.join('\n') + '\n'
}

export function reportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `repbunny-bug-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`
}

export const REPORT_SUBJECT = 'RepBunny bug report'
// Browsers and mail apps cap how long a mailto: link can be. Phones take far
// more than desktop Windows (~2,000), and the pilot is on phones.
const MAILTO_BODY_LIMIT = 8000
const TRIMMED_NOTE = '\n\n[Trimmed to fit in an email link. The full report was longer.]'

export function trimForMailto(text: string, limit = MAILTO_BODY_LIMIT): string {
  if (encodeURIComponent(text).length <= limit) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (encodeURIComponent(text.slice(0, mid) + TRIMMED_NOTE).length <= limit) low = mid
    else high = mid - 1
  }
  return text.slice(0, low) + TRIMMED_NOTE
}

// The full report if it fits, else without stacks, else cut with a note.
export function mailtoBody(input: BugReportInput, limit = MAILTO_BODY_LIMIT): string {
  const full = buildBugReport(input)
  if (encodeURIComponent(full).length <= limit) return full
  return trimForMailto(buildBugReport({ ...input, includeStacks: false }), limit)
}

function supportMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function mailtoLink(input: BugReportInput): string {
  return supportMailto(REPORT_SUBJECT, mailtoBody(input))
}

// Issue #100: "Request a feature", next to Report a bug. Same email path, no
// errors and no attachment: the idea, then the device lines.
export const FEATURE_SUBJECT = 'RepBunny feature request'

export interface FeatureRequestInput {
  request: string
  appVersion: string | null
  now?: Date
}

export function buildFeatureRequest({ request, appVersion, now = new Date() }: FeatureRequestInput): string {
  return [FEATURE_SUBJECT, '', 'Request:', request.trim(), '', ...deviceLines(appVersion, now)].join('\n') + '\n'
}

function toBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Native apps: the system email composer (only email apps on Android). A bug
// report attaches the whole report as a .txt and puts the description in the
// body; a feature request is just the body.
interface SupportEmail {
  subject: string
  nativeBody: string
  attachment?: { name: string; text: string }
  mailtoBody: () => string
}

async function composeNative(email: SupportEmail): Promise<void> {
  const { EmailComposer } = await import('capacitor-email-composer')
  await EmailComposer.open({
    to: [SUPPORT_EMAIL],
    subject: email.subject,
    body: email.nativeBody,
    attachments: email.attachment ? [{ type: 'base64', path: toBase64(email.attachment.text), name: email.attachment.name }] : [],
  })
}

// An <a> click rather than location.href, so leaving for the mail app never
// unloads the page (and a test can catch the link).
function openLink(href: string) {
  const link = document.createElement('a')
  link.href = href
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function sendSupportEmail(email: SupportEmail): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await composeNative(email)
      return
    } catch {
      // No composer (an older build without the plugin): use the link.
    }
  }
  openLink(supportMailto(email.subject, email.mailtoBody()))
}

// Errors picked: the description in the body and the full report attached.
// Nothing picked: the report is short, so it is the body itself, no attachment.
export function nativeBugReportEmail(input: BugReportInput): { body: string; attachment?: { name: string; text: string } } {
  const count = input.errors.length
  if (!count) return { body: buildBugReport(input) }
  return {
    body: [
      input.description.trim() || '(no description)',
      '',
      followUpLine(input.followUp),
      '',
      `The full report with ${count} error${count === 1 ? '' : 's'} is attached.`,
    ].join('\n'),
    attachment: { name: reportFileName(input.now), text: buildBugReport(input) },
  }
}

export function sendBugReport(input: BugReportInput): Promise<void> {
  const { body, attachment } = nativeBugReportEmail(input)
  return sendSupportEmail({ subject: REPORT_SUBJECT, nativeBody: body, attachment, mailtoBody: () => mailtoBody(input) })
}

export function sendFeatureRequest(input: FeatureRequestInput): Promise<void> {
  const body = buildFeatureRequest(input)
  return sendSupportEmail({ subject: FEATURE_SUBJECT, nativeBody: body, mailtoBody: () => trimForMailto(body) })
}

// Issue #568: "Email support" when the in-app guide search finds nothing. The
// search words go in the body so we know what the guides are missing; the
// user writes the question in their own email app, as with a bug report.
export const HELP_SUBJECT = 'RepBunny question'

export function buildHelpRequest(query: string, appVersion: string | null, now: Date = new Date()): string {
  return [`I searched the guides for: "${query.trim()}"`, '', 'My question:', '', '', ...deviceLines(appVersion, now)].join('\n') + '\n'
}

export function sendHelpRequest(query: string, appVersion: string | null): Promise<void> {
  const body = buildHelpRequest(query, appVersion)
  return sendSupportEmail({ subject: HELP_SUBJECT, nativeBody: body, mailtoBody: () => trimForMailto(body) })
}
