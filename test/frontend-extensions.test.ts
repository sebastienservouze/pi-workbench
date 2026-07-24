import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrontendExtensionRegistry, type ActivityRenderer, type CustomMessageRenderer, type RightSidebarWidgetRenderer, type ToolCallRenderer } from '../src/extensions/frontend.ts'

const activityRenderer: ActivityRenderer = () => null
const messageRenderer: CustomMessageRenderer = () => null
const toolCallRenderer: ToolCallRenderer = () => null
const widgetRenderer: RightSidebarWidgetRenderer = () => null

test('registers frontend renderers without allowing ambiguous contributions', () => {
  const registry = createFrontendExtensionRegistry([
    { id: 'custom-tools', activity: activityRenderer, messages: { notice: messageRenderer }, rightSidebarWidgets: [{ icon: '*', id: 'status', label: 'Statut', render: widgetRenderer }], toolCalls: { inspect: toolCallRenderer } },
  ])

  assert.equal(registry.activity, activityRenderer)
  assert.equal(registry.messages.get('notice'), messageRenderer)
  assert.equal(registry.rightSidebarWidgets.get('extension:custom-tools/status')?.render, widgetRenderer)
  assert.equal(registry.toolCalls.get('inspect'), toolCallRenderer)
  assert.throws(
    () => createFrontendExtensionRegistry([
      { id: 'widgets', rightSidebarWidgets: [
        { icon: '1', id: 'status', label: 'Statut', render: widgetRenderer },
        { icon: '2', id: 'status', label: 'Autre statut', render: widgetRenderer },
      ] },
    ]),
    /Widget de sidebar dupliqué : widgets\/status/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { id: 'first', activity: activityRenderer },
      { id: 'second', activity: activityRenderer },
    ]),
    /Renderer d’activité fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { id: 'first', toolCalls: { inspect: toolCallRenderer } },
      { id: 'second', toolCalls: { inspect: toolCallRenderer } },
    ]),
    /Renderer de l'outil inspect fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { id: 'first', messages: { notice: messageRenderer } },
      { id: 'second', messages: { notice: messageRenderer } },
    ]),
    /Renderer du message notice fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([{ id: '' }]),
    /identifiant d’extension frontend est requis/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { id: 'duplicate' },
      { id: 'duplicate' },
    ]),
    /Extension frontend dupliquée : duplicate/,
  )
})
