export const interfaceScaleOptions = [
  { label: 'Normal (100%)', value: '1' },
  { label: 'Comfortable (112.5%)', value: '1.125' },
  { label: 'Large (125%)', value: '1.25' },
] as const

export type InterfaceScale = typeof interfaceScaleOptions[number]['value']

/** Returns a supported interface scale without allowing malformed storage to affect startup. */
export function readInterfaceScale(value: string | null): InterfaceScale {
  return interfaceScaleOptions.some((option) => option.value === value) ? value as InterfaceScale : '1'
}
