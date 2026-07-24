import { createFrontendExtensionRegistry, type WorkbenchExtension } from '../extensions/frontend.ts'

// Ajoutez ici les extensions propres au fork ; upstream conserve cette liste vide.
export const customExtensions: readonly WorkbenchExtension[] = []

export const customExtensionRegistry = createFrontendExtensionRegistry(customExtensions)
