import type { ComponentType, ReactNode } from 'react'

export interface ActivityView {
  agentName?: string
  kind: 'thinking' | 'tool-preparing' | 'tool-waiting' | 'waiting' | 'working' | 'writing'
  thinking?: string
}

export interface ActivityRendererProps {
  activity: Readonly<ActivityView>
  renderDefault: () => ReactNode
}

export type ActivityRenderer = ComponentType<ActivityRendererProps>

export interface CustomMessageView {
  content: unknown
  customType: string
  details?: unknown
  timestamp?: number
}

export interface CustomMessageRendererProps {
  message: Readonly<CustomMessageView>
  renderDefault: () => ReactNode
}

export type CustomMessageRenderer = ComponentType<CustomMessageRendererProps>

export interface RightSidebarWidgetProps {
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  workspacePath: string
}

export type RightSidebarWidgetRenderer = ComponentType<RightSidebarWidgetProps>

export interface RightSidebarWidgetContribution {
  icon: ReactNode
  id: string
  label: string
  render: RightSidebarWidgetRenderer
}

export interface RegisteredRightSidebarWidget extends RightSidebarWidgetContribution {
  extensionId: string
  key: `extension:${string}`
}

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
  id: string
  activity?: ActivityRenderer
  messages?: Record<string, CustomMessageRenderer>
  rightSidebarWidgets?: readonly RightSidebarWidgetContribution[]
  toolCalls?: Record<string, ToolCallRenderer>
}

export interface FrontendExtensionRegistry {
  activity?: ActivityRenderer
  messages: ReadonlyMap<string, CustomMessageRenderer>
  rightSidebarWidgets: ReadonlyMap<`extension:${string}`, RegisteredRightSidebarWidget>
  toolCalls: ReadonlyMap<string, ToolCallRenderer>
}

/** Valide les identifiants et assemble les contributions frontend sans remplacement implicite. */
export function createFrontendExtensionRegistry(extensions: readonly WorkbenchExtension[]): FrontendExtensionRegistry {
  const extensionIds = new Set<string>()
  let activity: ActivityRenderer | undefined
  let activityOwner: string | undefined
  const messageOwners = new Map<string, string>()
  const messages = new Map<string, CustomMessageRenderer>()
  const rightSidebarWidgets = new Map<`extension:${string}`, RegisteredRightSidebarWidget>()
  const toolCallOwners = new Map<string, string>()
  const toolCalls = new Map<string, ToolCallRenderer>()

  for (const extension of extensions) {
    if (!extension.id.trim()) throw new Error('Un identifiant d’extension frontend est requis')
    if (extensionIds.has(extension.id)) throw new Error(`Extension frontend dupliquée : ${extension.id}`)
    extensionIds.add(extension.id)

    if (extension.activity) {
      if (activityOwner) throw new Error(`Renderer d’activité fourni par ${activityOwner} et ${extension.id}`)
      activityOwner = extension.id
      activity = extension.activity
    }

    for (const [customType, renderer] of Object.entries(extension.messages ?? {})) {
      const owner = messageOwners.get(customType)
      if (owner) throw new Error(`Renderer du message ${customType} fourni par ${owner} et ${extension.id}`)
      messageOwners.set(customType, extension.id)
      messages.set(customType, renderer)
    }

    for (const widget of extension.rightSidebarWidgets ?? []) {
      if (!widget.id.trim() || !widget.label.trim()) throw new Error(`Le widget de sidebar de ${extension.id} requiert un identifiant et un libellé`)
      const key = `extension:${encodeURIComponent(extension.id)}/${encodeURIComponent(widget.id)}` as const
      if (rightSidebarWidgets.has(key)) throw new Error(`Widget de sidebar dupliqué : ${extension.id}/${widget.id}`)
      rightSidebarWidgets.set(key, { ...widget, extensionId: extension.id, key })
    }

    for (const [toolName, renderer] of Object.entries(extension.toolCalls ?? {})) {
      const owner = toolCallOwners.get(toolName)
      if (owner) throw new Error(`Renderer de l'outil ${toolName} fourni par ${owner} et ${extension.id}`)
      toolCallOwners.set(toolName, extension.id)
      toolCalls.set(toolName, renderer)
    }
  }

  return { activity, messages, rightSidebarWidgets, toolCalls }
}
