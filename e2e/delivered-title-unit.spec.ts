import { test, expect } from '@playwright/test'
import { deliveredTitle } from '../src/lib/deliveredTitle'

test('export toasts say saved on the web and ready to save in the native apps (#483)', () => {
  expect(deliveredTitle('Backup', false)).toBe('Backup saved')
  expect(deliveredTitle('CSV', false)).toBe('CSV saved')
  expect(deliveredTitle('Backup', true)).toBe('Backup ready to save')
  expect(deliveredTitle('CSV', true)).toBe('CSV ready to save')
})
