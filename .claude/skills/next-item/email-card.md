# next-item email cards

Read by next-item step 9 only when `pwsh` is on PATH and the Gmail variables are set.

## Email (HTML card)

Keep the copy in each field as short as the terminal summary — the point is a cleaner layout, not
more words. Use inline styles only (email clients strip `<style>` blocks and external CSS). Colors
and fonts come from `docs/brand-identity.md`'s token table (dark plum surface, Bunny Pink accent,
lavender secondary, Manrope/Baloo 2 with rounded-font fallbacks for clients that can't load them).
The Shipped banner uses the app's own `--accent`/`--accent-text` pairing from `src/style.css`
(`#f2879c` fill, `#241a2c` label — the same colors the app's primary CTA buttons use) with a
checkmark, not the plain green from an earlier version — green wasn't in the app's palette at all.
Blocked uses the app's own `--danger` token (`#e0687a`) with `--accent-text` (`#241a2c`) labels —
the exact styling of the app's `.danger` buttons, e.g. "Confirm delete" (white on `--danger` fails
contrast, #67) — with a matching ✕ for the same done/not-done visual language.
Fill the placeholders (ALL-CAPS tokens) and send exactly this markup, changing nothing else about
the structure. The label column has a fixed width and every value cell has
`word-break:break-word;overflow-wrap:anywhere` with `table-layout:fixed` on the table itself, and
there's no `overflow:hidden` anywhere on the card — that combination is what a prior version of
this template got wrong: an auto-sized table let long unbroken tokens (file paths, run-on
sentences) push a column wider than the 520px card, and `overflow:hidden` on the card silently
clipped the overflow instead of wrapping it. Keep all three in place if you ever touch this markup.

**Shipped** (subject: `Shipped: <commit subject line>`). `SHORT_SHA` and `TEST_STEPS` are the same
short SHA and "How to test" steps as the terminal summary, each step as its own
`<li style="margin:0 0 4px;">…</li>`. `WAITING` is the terminal summary's "Waiting on you" text;
drop that whole row (in both templates) when there's nothing waiting:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:520px;width:100%;margin:0 auto;background:#211829;border-radius:14px;">
      <div style="padding:14px 20px;background:#17111c;border-radius:14px 14px 0 0;">
        <span style="font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;color:#f2879c;font-size:14px;font-weight:700;">🐰 RepBunny</span>
      </div>
      <div style="padding:10px 20px;background:#f2879c;">
        <span style="color:#241a2c;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">&#10003; Shipped</span>
      </div>
      <div style="padding:20px;background:#211829;border-radius:0 0 14px 14px;">
        <h2 style="margin:0 0 2px;font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;font-size:18px;color:#f2879c;word-break:break-word;overflow-wrap:anywhere;">TITLE</h2>
        <p style="margin:0 0 16px;font-size:12px;color:#b79cf0;">Issue #N</p>
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;color:#f5edf2;">
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">What changed</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">SUMMARY</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Files</td><td style="padding:5px 0;font-family:Consolas,monospace;font-size:12px;color:#b9a8c2;word-break:break-word;overflow-wrap:anywhere;">FILES</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Verified</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">VERIFIED</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Commit</td><td style="padding:5px 0;font-family:Consolas,monospace;font-size:12px;color:#b9a8c2;word-break:break-word;overflow-wrap:anywhere;">SHORT_SHA COMMIT</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">How to test</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;"><ol style="margin:0;padding-left:18px;">TEST_STEPS</ol></td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Waiting on you</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">WAITING</td></tr>
        </table>
      </div>
    </div>
  </body>
</html>
```

**Blocked** (subject: `Backlog issue blocked: <issue title>`) — same shape, coral banner, two rows:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:520px;width:100%;margin:0 auto;background:#211829;border-radius:14px;">
      <div style="padding:14px 20px;background:#17111c;border-radius:14px 14px 0 0;">
        <span style="font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;color:#f2879c;font-size:14px;font-weight:700;">🐰 RepBunny</span>
      </div>
      <div style="padding:10px 20px;background:#e0687a;">
        <span style="color:#241a2c;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">&#10007; Blocked</span>
      </div>
      <div style="padding:20px;background:#211829;border-radius:0 0 14px 14px;">
        <h2 style="margin:0 0 2px;font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;font-size:18px;color:#f2879c;word-break:break-word;overflow-wrap:anywhere;">TITLE</h2>
        <p style="margin:0 0 16px;font-size:12px;color:#b79cf0;">Issue #N</p>
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;color:#f5edf2;">
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Reason</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">REASON</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Attempts</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">ATTEMPTS</td></tr>
          <tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">Waiting on you</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">WAITING</td></tr>
        </table>
      </div>
    </div>
  </body>
</html>
```
