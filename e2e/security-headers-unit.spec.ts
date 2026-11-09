import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'

// #268: both Pages projects ship security headers from a _headers file.
function headers(path: string) {
  const out = new Map<string, string>()
  // \r?: a Windows checkout (core.autocrlf) has CRLF, and `.` won't match \r.
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line)
    if (m) out.set(m[1], m[2])
  }
  return out
}

function checkCommon(h: Map<string, string>) {
  expect(h.get('X-Content-Type-Options')).toBe('nosniff')
  expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  expect(h.get('Permissions-Policy')).toContain('camera=()')
}

test('the app ships security headers and a CSP limiting connect-src to its own origin', () => {
  const h = headers('public/_headers')
  checkCommon(h)
  expect(h.has('Content-Security-Policy-Report-Only')).toBe(false)
  const csp = h.get('Content-Security-Policy')!
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("connect-src 'self';")
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
  expect(csp).toContain("object-src 'none'")
})

test('the site CSP hashes match its inline scripts', () => {
  const h = headers('site/_headers')
  checkCommon(h)
  const csp = h.get('Content-Security-Policy')!
  expect(csp).toContain("frame-ancestors 'none'")
  // Hashed as deployed (LF), whatever this checkout's line endings are.
  const html = readFileSync('site/index.html', 'utf8').replace(/\r\n/g, '\n')
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  expect(scripts.length).toBeGreaterThan(0)
  for (const s of scripts) {
    expect(csp).toContain(`'sha256-${createHash('sha256').update(s[1]).digest('base64')}'`)
  }
})

test('the app build copies _headers into dist', () => {
  test.skip(!existsSync('dist'), 'needs a prior npm run build')
  expect(existsSync('dist/_headers')).toBe(true)
})
