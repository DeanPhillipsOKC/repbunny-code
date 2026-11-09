// Typed confirms ("Type RESTORE to confirm") ignore case and stray leading or
// trailing spaces, since phone keyboards autocomplete a trailing space or
// change the case. Inner spaces still fail.
export function matchesConfirmWord(text: string, word: string): boolean {
  return text.trim().toUpperCase() === word
}
