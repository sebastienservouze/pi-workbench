import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrontendExtensionRegistry, type ActivityRenderer, type CustomMessageRenderer, type RightSidebarWidgetRenderer, type ToolCallRenderer } from '../src/extensions/frontend.ts'

const activityRenderer: ActivityRenderer = () => null
const messageRenderer: CustomMessageRenderer = () => null
const toolCallRenderer: ToolCallRenderer = () => null
const widgetRenderer: RightSidebarWidgetRenderer = () => null

test('registers frontend renderers without allowing ambiguous contributions', () => {
  const registry = createFrontendExtensionRegistry([
    { apiVersion: 1, id: 'custom-tools', activity: activityRenderer, messages: { notice: messageRenderer }, rightSidebarWidgets: [{ icon: '*', id: 'status', label: 'Statut', render: widgetRenderer }], toolCalls: { inspect: toolCallRenderer } },
  ])

  assert.equal(registry.activity, activityRenderer)
  assert.equal(registry.messages.get('notice'), messageRenderer)
  assert.equal(registry.rightSidebarWidgets.get('extension:custom-tools/status')?.render, widgetRenderer)
  assert.equal(registry.toolCalls.get('inspect'), toolCallRenderer)
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'widgets', rightSidebarWidgets: [
        { icon: '1', id: 'status', label: 'Statut', render: widgetRenderer },
        { icon: '2', id: 'status', label: 'Autre statut', render: widgetRenderer },
      ] },
    ]),
    /Widget de sidebar dupliqué : widgets\/status/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'first', activity: activityRenderer },
      { apiVersion: 1, id: 'second', activity: activityRenderer },
    ]),
    /Renderer d’activité fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'first', toolCalls: { inspect: toolCallRenderer } },
      { apiVersion: 1, id: 'second', toolCalls: { inspect: toolCallRenderer } },
    ]),
    /Renderer de l'outil inspect fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'first', messages: { notice: messageRenderer } },
      { apiVersion: 1, id: 'second', messages: { notice: messageRenderer } },
    ]),
    /Renderer du message notice fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([{ apiVersion: 1, id: '' }]),
    /identifiant d’extension frontend est requis/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'duplicate' },
      { apiVersion: 1, id: 'duplicate' },
    ]),
    /Extension frontend dupliquée : duplicate/,
  )
})
