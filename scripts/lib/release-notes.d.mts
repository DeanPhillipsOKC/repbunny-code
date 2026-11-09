// Same shapes as src/lib/releaseNotes.ts, which the Node tsconfig can't import (it reads a Vite define).
type ReleaseNoteItem = string | { text: string; guide?: string; platforms?: ('pwa' | 'ios' | 'android')[] }
type ReleaseNote = { date: string; build: number; items: ReleaseNoteItem[] }

export const NOTES_DIR: string
export const ARCHIVE_FILE: string
export const NOTE_FILE: RegExp
export function checkItem(item: unknown, name: string): ReleaseNoteItem
export function groupReleaseNotes(
  archive: ReleaseNote[],
  entries: { file: string; date: string; build: number; item: ReleaseNoteItem }[],
): ReleaseNote[]
export function loadReleaseNotes(cwd?: string): ReleaseNote[]
