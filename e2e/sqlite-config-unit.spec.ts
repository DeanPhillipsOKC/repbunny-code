import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import config from '../capacitor.config'

// Issue #639: @capacitor-community/sqlite turns encryption on by default,
// which opens EncryptedSharedPreferences with an Android Keystore key when the
// plugin loads. Auto Backup restores the prefs file on a reinstall but never
// the key, so the plugin failed to load and the app opened on the recovery
// screen with every restore failing too. The app never encrypts a database
// (every connection is 'no-encryption'), so the plugin is told not to.

test('the SQLite plugin never uses the keystore', () => {
  const sqlite = config.plugins?.CapacitorSQLite as Record<string, unknown> | undefined
  expect(sqlite?.androidIsEncryption).toBe(false)
  expect(sqlite?.iosIsEncryption).toBe(false)
})

test('backups and transfers leave out the plugin secrets file', () => {
  const exclude = '<exclude domain="sharedpref" path="sqlite_encrypted_shared_prefs.xml" />'
  const xml = (name: string) => readFileSync(`android/app/src/main/res/xml/${name}.xml`, 'utf8')
  expect(xml('backup_rules')).toContain(exclude)
  const rules = xml('data_extraction_rules')
  expect(rules).toMatch(new RegExp(`<cloud-backup>[\\s\\S]*${exclude}[\\s\\S]*</cloud-backup>`))
  expect(rules).toMatch(new RegExp(`<device-transfer>[\\s\\S]*${exclude}[\\s\\S]*</device-transfer>`))
})
