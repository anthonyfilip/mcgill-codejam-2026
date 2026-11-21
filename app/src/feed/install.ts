// "Add to Home Screen" support. Chrome/Android fires `beforeinstallprompt` once, early, so we
// catch it as soon as the page loads (imported first thing in main.tsx) and keep it for the
// profile's "Add to Home Screen" button. iPhones have no such event: they get instructions.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let promptEvent: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // we show our own button instead of Chrome's mini bar
  promptEvent = e as InstallPromptEvent
  listeners.forEach((f) => f())
})
addEventListener('appinstalled', () => {
  promptEvent = null
  listeners.forEach((f) => f())
})

export const canPromptInstall = () => promptEvent !== null
export const onInstallChange = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

// Chrome's own install box. Returns true if they installed it.
export async function promptInstall(): Promise<boolean> {
  if (!promptEvent) return false
  await promptEvent.prompt()
  const { outcome } = await promptEvent.userChoice
  promptEvent = null
  return outcome === 'accepted'
}

// Opened from the home-screen icon already?
export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const ua = navigator.userAgent
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// On iPhone only Safari can add to the home screen (not Chrome, Firefox or in-app browsers).
export const isIOSSafari =
  isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV|Snapchat|TikTok/.test(ua)
