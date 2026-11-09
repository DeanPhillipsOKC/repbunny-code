import { test, expect } from '@playwright/test'
import { emailCard, issueBody } from '../scripts/demo-video/review/review-issue.mjs'

// #663: the sprint review email carries the video as an attachment, since the GitHub app
// can't play the issue's link on a phone. No page needed.

const release = {
  version: '1.4.0',
  bump: 'minor',
  tag: 'store/v1.3.0',
  upNext: [],
  changes: [{ issue: 535, title: 'Thing', notes: ['A note.'], clip: true }],
}
const url = 'https://github.com/o/r/issues/662'
const videoUrl = 'https://github.com/o/r/blob/claude/issue-assets/review-1.4.0/sprint-review.mp4'

test('email card says the video is attached and links to the review issue', () => {
  const html = emailCard(release, url, videoUrl, true)
  expect(html).toContain('The video is attached to this email.')
  expect(html).toContain('Open the review')
  expect(html).not.toContain('Watch the review')
  expect(html).toContain(`href="${url}" style`)
})

test('email card without an attachment keeps the Watch the review link', () => {
  const html = emailCard(release, url, videoUrl)
  expect(html).toContain('Watch the review')
  expect(html).toContain(`href="${videoUrl}"`)
  expect(html).not.toContain('attached to this email')
})

test('issue body labels the video and clip links honestly', () => {
  const body = issueBody(release, { duration: 66, clips: [{ issue: 535, at: 5 }] }, `[sprint-review.mp4](${videoUrl})`, 'run')
  expect(body).toContain('On a phone, play it from the email attachment or run /sprint-review in Claude.')
  expect(body).toContain('(desktop download)')
})
