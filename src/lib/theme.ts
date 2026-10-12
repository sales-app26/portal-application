// Light, dark, or follow the phone. The choice is per device (localStorage); the resolved
// theme lives on <html data-theme>, which the stylesheet's tokens and `dark:` read.
// index.html runs the same resolution inline before the first paint, so there is no flash.

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'st.theme'
/** The status bar / browser chrome colour per theme, matching --color-canvas. */
const CHROME = { light: '#ffffff', dark: '#0f1115' } as const

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* storage blocked: follow the system */
  }
  return 'system'
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()) {
  const resolved = choice === 'system' ? (media().matches ? 'dark' : 'light') : choice
  const root = document.documentElement
  root.dataset.theme = resolved
  // HeroUI also reads a light/dark class.
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[resolved])
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* storage blocked: applies for this visit only */
  }
  applyTheme(choice)
}

/** Keeps "System" in step when the phone switches between light and dark (e.g. at sunset). */
export function watchSystemTheme() {
  media().addEventListener('change', () => {
    if (getThemeChoice() === 'system') applyTheme('system')
  })
}
