import type { ComponentType, ReactNode } from 'react'

export interface ToolCallView {
  id: string
  name: string
  args: unknown
  rawArgs?: string
  result?: { content: unknown; isError: boolean }
  status: 'completed' | 'generating' | 'interrupted' | 'running'
}

export interface ToolCallRendererProps {
  toolCall: Readonly<ToolCallView>
  renderDefault: () => ReactNode
}

export type ToolCallRenderer = ComponentType<ToolCallRendererProps>

export interface WorkbenchExtension {
  apiVersion: 1
  id: string
  toolCalls?: Record<string, ToolCallRenderer>
}

export interface FrontendExtensionRegistry {
  toolCalls: ReadonlyMap<string, ToolCallRenderer>
}

/** Valide les identifiants et assemble les contributions frontend sans remplacement implicite. */
export function createFrontendExtensionRegistry(extensions: readonly WorkbenchExtension[]): FrontendExtensionRegistry {
  const extensionIds = new Set<string>()
  const toolCallOwners = new Map<string, string>()
  const toolCalls = new Map<string, ToolCallRenderer>()

  for (const extension of extensions) {
    if (extensionIds.has(extension.id)) throw new Error(`Extension frontend dupliquée : ${extension.id}`)
    extensionIds.add(extension.id)

    for (const [toolName, renderer] of Object.entries(extension.toolCalls ?? {})) {
      const owner = toolCallOwners.get(toolName)
      if (owner) throw new Error(`Renderer de l'outil ${toolName} fourni par ${owner} et ${extension.id}`)
      toolCallOwners.set(toolName, extension.id)
      toolCalls.set(toolName, renderer)
    }
  }

  return { toolCalls }
}
