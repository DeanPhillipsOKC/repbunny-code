// Issue #857: a store release can ship a seasonal icon as the app's default
// (scripts/apply-default-icon.mjs sets VITE_DEFAULT_APP_ICON in that build).
// The App icon picker's Default tile (#861) gives the default icon on both
// platforms, so it shows that icon. Kept free of imports so
// e2e/apply-default-icon-unit.spec.ts can load it.
export function defaultIconImage(defaultIcon: string | undefined) {
  return defaultIcon?.startsWith('season-') ? `/app-icons/${defaultIcon}.webp` : '/app-icons/classic.png'
}
