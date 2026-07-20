import assert from 'node:assert/strict'
import test from 'node:test'
import { addPickedLauncher, launcherSnapshot, parseLauncherRegistry, pickerArguments, selectWorkspaceLauncher } from '../server/launchers.ts'
import type { LauncherRegistry } from '../shared/types.ts'

const registry: LauncherRegistry = {
  launchers: [{ id: 'idea', name: 'IntelliJ IDEA', executablePath: 'C:\\idea64.exe' }],
  defaultLauncherId: 'idea',
  workspaceLauncherIds: {},
}

test('privilégie le lanceur mémorisé par workspace puis le lanceur par défaut', () => {
  assert.equal(launcherSnapshot(registry, '/workspace/a').selectedLauncherId, 'idea')
  const withSecond = addPickedLauncher(registry, { name: 'Rider', executablePath: 'C:\\rider64.exe' })
  const rider = withSecond.launchers.find(({ name }) => name === 'Rider')
  assert.ok(rider)
  const selected = selectWorkspaceLauncher(withSecond, '/workspace/a', rider.id)
  assert.equal(launcherSnapshot(selected, '/workspace/a').selectedLauncherId, rider.id)
  assert.equal(launcherSnapshot(selected, '/workspace/b').selectedLauncherId, 'idea')
})

test('lance le sélecteur Windows dans un appartement STA interactif', () => {
  assert.deepEqual(pickerArguments().slice(0, 3), ['-NoProfile', '-STA', '-Command'])
})

test('réutilise un exécutable déjà connu et lit le dernier choix historique comme défaut', () => {
  const parsed = parseLauncherRegistry(JSON.stringify({
    launchers: registry.launchers,
    lastLauncherId: 'idea',
    workspaceLauncherIds: {},
  }))
  assert.equal(parsed.defaultLauncherId, 'idea')
  const updated = addPickedLauncher(parsed, { name: 'IDE renommé', executablePath: 'c:\\IDEA64.EXE' }, 'data:image/png;base64,AA==')
  assert.equal(updated.launchers.length, 1)
  assert.equal(updated.launchers[0].iconDataUrl, 'data:image/png;base64,AA==')
})
