// Issue #483: in the native apps the share sheet is the only save step the app
// sees, so it can't claim the file was saved, only that it was handed over.
export function deliveredTitle(kind: 'Backup' | 'CSV', native: boolean): string {
  return native ? `${kind} ready to save` : `${kind} saved`
}

export const NATIVE_SAVE_HINT = 'Pick Drive, Files, or an app in the share sheet to keep it'
