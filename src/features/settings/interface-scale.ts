export const interfaceScaleOptions = [
  { label: 'Normal (100%)', value: '1' },
  { label: 'Comfortable (112.5%)', value: '1.125' },
  { label: 'Large (125%)', value: '1.25' },
] as const

export type InterfaceScale = typeof interfaceScaleOptions[number]['value']

/** Chooses a readable initial scale from the screen's estimated physical resolution. */
export function defaultInterfaceScale(screenHeight: number, devicePixelRatio: number): InterfaceScale {
  const physicalHeight = Math.round(screenHeight * devicePixelRatio)
  if (physicalHeight >= 2160) return '1.25'
  if (physicalHeight >= 1440) return '1.125'
  return '1'
}

/** Returns a supported interface scale without allowing malformed storage to affect startup. */
export function readInterfaceScale(value: string | null, fallback: InterfaceScale = '1'): InterfaceScale {
  return interfaceScaleOptions.some((option) => option.value === value) ? value as InterfaceScale : fallback
}
