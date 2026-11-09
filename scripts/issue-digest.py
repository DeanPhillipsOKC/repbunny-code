#!/usr/bin/env python3
"""Emails the owner one digest of the issues opened or closed since the last digest (#542).

Run by the scheduled run of .github/workflows/dispatch-lanes.yml, which replaced one email per
issue event with this single email (owner decision 2026-10-15). Reads the repo through the REST
API (never GraphQL) and sends through Gmail SMTP.

  SINCE=<ISO time> [UNTIL=<ISO time>] python3 scripts/issue-digest.py   # send
  SINCE=<ISO time> python3 scripts/issue-digest.py --dry-run  # print the email, send nothing

Env: SINCE (required, window start), UNTIL (optional window end; default: no limit), REPO, GH_TOKEN, MAIL_USERNAME, MAIL_PASSWORD. Without the
mail secrets it does nothing. Sends nothing when no issue opened or closed in the window.
"""
import json, os, smtplib, sys, urllib.request
from email.message import EmailMessage

DRY = '--dry-run' in sys.argv
# The backlog repo first (#944, scripts/backlog-repo.mjs), then the repo this runs in.
REPO = os.environ.get('BACKLOG_REPO') or os.environ.get('REPO') or os.environ.get('GITHUB_REPOSITORY')
SINCE = os.environ.get('SINCE')
UNTIL = os.environ.get('UNTIL') or '9999'
if not REPO or not SINCE:
    sys.exit('SINCE and REPO (or GITHUB_REPOSITORY) are required')


def api(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/{path}',
        headers={
            'Authorization': f"Bearer {os.environ.get('GH_TOKEN', '')}",
            'Accept': 'application/vnd.github+json',
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.load(res)


# `since` filters on updated_at, which is never earlier than created_at or closed_at, so every
# issue opened or closed in the window is in this list. PRs share the endpoint; skip them.
issues, page = [], 1
while True:
    batch = api(f'issues?state=all&since={SINCE}&per_page=100&page={page}')
    issues += [i for i in batch if 'pull_request' not in i]
    if len(batch) < 100:
        break
    page += 1

opened = sorted((i for i in issues if SINCE < i['created_at'] <= UNTIL), key=lambda i: i['number'])
shipped = sorted(
    (i for i in issues
     if i['state'] == 'closed' and i['state_reason'] == 'completed' and SINCE < (i['closed_at'] or '') <= UNTIL),
    key=lambda i: i['number'],
)
if not opened and not shipped:
    print('No issues opened or shipped since', SINCE)
    sys.exit(0)

lines = []
if shipped:
    lines.append(f'SHIPPED ({len(shipped)})\n')
    for i in shipped:
        comments = api(f"issues/{i['number']}/comments?per_page=100&page=1")
        # next-item posts its close-out comment just after the issue closes.
        notes = [c['body'] for c in comments if c['created_at'] >= i['closed_at']]
        note = (notes[-1].strip() if notes else 'No close-out comment yet; see the issue.')
        if len(note) > 1500:
            note = note[:1500].rstrip() + '\n\n(continued on GitHub)'
        lines.append(f"#{i['number']} {i['title']}\n{i['html_url']}\n\n{note}\n\n---\n")
if opened:
    lines.append(f'NEW ({len(opened)})\n')
    for i in opened:
        labels = ', '.join(l['name'] for l in i.get('labels') or []) or 'none'
        body = (i.get('body') or '').strip()
        if len(body) > 600:
            body = body[:600].rstrip() + '\n\n(continued on GitHub)'
        lines.append(
            f"#{i['number']} {i['title']}\n{i['html_url']}\n"
            f"Opened by {i['user']['login']}. Labels: {labels}\n\n{body or '(no description)'}\n\n---\n"
        )

user, password = os.environ.get('MAIL_USERNAME'), os.environ.get('MAIL_PASSWORD')
msg = EmailMessage()
msg['Subject'] = f'RepBunny digest: {len(shipped)} shipped, {len(opened)} new'
msg['From'] = user or 'digest'
msg['To'] = user or 'digest'
msg.set_content('\n'.join(lines))
if DRY:
    print(msg['Subject'], '\n')
    print(msg.get_content())
    sys.exit(0)
if not user or not password:
    print('::notice::MAIL_USERNAME or MAIL_PASSWORD not set; no email sent.')
    sys.exit(0)
with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
    smtp.login(user, password)
    smtp.send_message(msg)
print(f'Emailed a digest: {len(shipped)} shipped, {len(opened)} new.')
