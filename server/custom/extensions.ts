import { createBackendExtensionRegistry, type WorkbenchBackendExtension } from '../extensions/backend.ts'

export const customBackendExtensions: readonly WorkbenchBackendExtension[] = []

export const customBackendExtensionRegistry = createBackendExtensionRegistry(customBackendExtensions)
