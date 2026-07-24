import assert from 'node:assert/strict'
import test from 'node:test'
import { createFrontendExtensionRegistry, type ToolCallRenderer } from '../src/extensions/frontend.ts'

const renderer: ToolCallRenderer = () => null

test('registers tool renderers without allowing ambiguous contributions', () => {
  const registry = createFrontendExtensionRegistry([
    { apiVersion: 1, id: 'custom-tools', toolCalls: { inspect: renderer } },
  ])

  assert.equal(registry.toolCalls.get('inspect'), renderer)
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'first', toolCalls: { inspect: renderer } },
      { apiVersion: 1, id: 'second', toolCalls: { inspect: renderer } },
    ]),
    /Renderer de l'outil inspect fourni par first et second/,
  )
  assert.throws(
    () => createFrontendExtensionRegistry([
      { apiVersion: 1, id: 'duplicate' },
      { apiVersion: 1, id: 'duplicate' },
    ]),
    /Extension frontend dupliquée : duplicate/,
  )
})
