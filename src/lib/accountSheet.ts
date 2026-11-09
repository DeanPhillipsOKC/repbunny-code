import { ref } from 'vue'
import type { LoggedError } from './bugReport'

// Whether AccountSheet (rendered once, in App.vue) is open. Shared module
// state rather than a prop/emit chain because several places open it:
// AccountButton (in each screen's PageHeader, or App's slim header on screens
// without one) and WorkoutLogger's compact workout header.
export const accountSheetOpen = ref(false)

// Issue #101: the screen the sheet opens on. Home's "just updated" banner
// opens it straight on What's new; everything else opens the menu.
// Issue #234: the "Send a report?" prompt opens it on Report a bug.
// Issue #429: the rest screen's Edit opens Preferences at the default rest.
// Issue #489: a Themes trial's "Pick a theme" opens the Theme screen.
export type AccountStartView = 'menu' | 'whats-new' | 'bug' | 'rest' | 'theme'
export const accountSheetStartView = ref<AccountStartView>('menu')

// Issue #234: the error the prompt offered, which Report a bug lists first and
// checks, with its action trail.
export const bugReportFocus = ref<LoggedError | null>(null)

// Issue #574: text a receipt ("This looks wrong") wrote for Report a bug's
// description box. BugReportSheet takes it once when it opens.
export const bugReportPrefill = ref<string | null>(null)

export function openAccountSheet(view: AccountStartView = 'menu') {
  accountSheetStartView.value = view
  bugReportFocus.value = null
  bugReportPrefill.value = null
  accountSheetOpen.value = true
}

export function openBugReport(error: LoggedError) {
  openAccountSheet('bug')
  bugReportFocus.value = error
}

// Issue #574: "This looks wrong" in a receipt or explanation sheet. Opens
// Report a bug with no error picked and the description already written;
// the user edits it and sends it from their own mail app.
export function openNumberReport(text: string) {
  openAccountSheet('bug')
  bugReportPrefill.value = text
}
