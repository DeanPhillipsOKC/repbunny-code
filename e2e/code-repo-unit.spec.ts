import { test, expect } from '@playwright/test'
import { codeRepo, repoFromRemote, DEFAULT_CODE_REPO } from '../scripts/code-repo.mjs'

// Issue #946: scripts that open PRs, mint app tokens, or set the ruleset read the repo they run in,
// so they follow the code to repbunny-code at the cutover. No page needed.

const noRemote = () => ''

test('reads owner/repo from https, ssh, and the cloud proxy remote', () => {
  expect(repoFromRemote('https://github.com/DeanPhillipsOKC/repbunny-code.git\n')).toBe('DeanPhillipsOKC/repbunny-code')
  expect(repoFromRemote('https://github.com/DeanPhillipsOKC/repbunny')).toBe('DeanPhillipsOKC/repbunny')
  expect(repoFromRemote('git@github.com:DeanPhillipsOKC/repbunny-code.git')).toBe('DeanPhillipsOKC/repbunny-code')
  expect(repoFromRemote('http://local_proxy@127.0.0.1:41235/git/DeanPhillipsOKC/repbunny-code')).toBe('DeanPhillipsOKC/repbunny-code')
  expect(repoFromRemote('')).toBeNull()
})

test('CODE_REPO wins, then GITHUB_REPOSITORY, then origin, then the default', () => {
  const origin = () => 'https://github.com/DeanPhillipsOKC/repbunny-code.git'
  expect(codeRepo({ CODE_REPO: 'me/scratch', GITHUB_REPOSITORY: 'a/b' }, origin)).toBe('me/scratch')
  expect(codeRepo({ GITHUB_REPOSITORY: 'DeanPhillipsOKC/repbunny-code' }, noRemote)).toBe('DeanPhillipsOKC/repbunny-code')
  expect(codeRepo({}, origin)).toBe('DeanPhillipsOKC/repbunny-code')
  expect(codeRepo({}, noRemote)).toBe(DEFAULT_CODE_REPO)
})

test('refuses an override that is not owner/repo', () => {
  expect(() => codeRepo({ CODE_REPO: 'repbunny-code' }, noRemote)).toThrow(/owner\/repo/)
})
