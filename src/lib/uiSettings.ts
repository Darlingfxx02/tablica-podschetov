import { useEffect, useState } from 'react'

export type OptionalDisplay = 'pill' | 'icon'

export interface UiSettings {
  /** How to mark optional sections in the sidebar: text pill ("Opts") or puzzle icon. */
  optionalDisplay: OptionalDisplay
}

const STORAGE_KEY = 'ui-settings'

const DEFAULT_UI_SETTINGS: UiSettings = {
  optionalDisplay: 'pill',
}

function load(): UiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_UI_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_UI_SETTINGS
}

/**
 * Browser-local UI preferences. Per-user, not per-proposal — persisted in
 * localStorage so they survive reloads but don't sync between machines.
 */
export function useUiSettings() {
  const [settings, setSettings] = useState<UiSettings>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  function patch(partial: Partial<UiSettings>) {
    setSettings(s => ({ ...s, ...partial }))
  }

  return { settings, patch } as const
}
