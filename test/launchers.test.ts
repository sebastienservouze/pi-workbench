import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStartCommand, createManualLauncher, launcherSnapshot, mergeDetectedLaunchers, parseDetectedLaunchers, parseLauncherRegistry, recordLauncherLaunch, selectWorkspaceLauncher, vsCodeArguments } from '../server/launchers.ts'
import type { LauncherRegistry } from '../shared/types.ts'

const registry: LauncherRegistry = {
  launchers: [{ id: 'idea', name: 'IntelliJ IDEA', product: 'intellij', source: 'detected', executablePath: 'C:\\idea64.exe', arguments: ['{workspace}'], version: '2025.1' }],
  workspaceLauncherIds: {},
}

test('mémorise un lanceur par workspace et retombe sur le dernier lancement', () => {
  const selected = selectWorkspaceLauncher(registry, '/workspace/a', 'idea')
  assert.equal(launcherSnapshot(selected, '/workspace/a').selectedLauncherId, 'idea')
  assert.equal(launcherSnapshot(selected, '/workspace/b').selectedLauncherId, undefined)
  assert.equal(launcherSnapshot(recordLauncherLaunch(selected, 'idea'), '/workspace/b').selectedLauncherId, 'idea')
})

test('valide le registre et fusionne une détection sans dupliquer le binaire', () => {
  assert.deepEqual(parseLauncherRegistry(JSON.stringify(registry)), registry)
  assert.throws(() => parseLauncherRegistry('{"launchers":[],"workspaceLauncherIds":{"/workspace":"missing"}}'), /Unknown workspace launcher/)
  const merged = mergeDetectedLaunchers(registry, parseDetectedLaunchers('{"product":"intellij","executablePath":"C:\\\\idea64.exe","version":"2025.1"}'))
  assert.equal(merged.launchers.length, 1)
})

test('ne conserve que la version la plus récente de chaque IDE détecté', () => {
  const detected = parseDetectedLaunchers('[{"product":"visualstudio","executablePath":"C:\\\\VS17\\\\devenv.exe","version":"17.12.4"},{"product":"visualstudio","executablePath":"C:\\\\VS18\\\\devenv.exe","version":"18.0.0"}]')
  assert.deepEqual(detected, [{ product: 'visualstudio', executablePath: 'C:\\VS18\\devenv.exe', version: '18.0.0' }])
})

test('prépare les commandes Windows sans shell libre et traite les workspaces WSL de VS Code', () => {
  assert.deepEqual(vsCodeArguments('\\\\wsl.localhost\\Ubuntu\\home\\user\\project'), ['--folder-uri', 'vscode-remote://wsl+Ubuntu/home/user/project'])
  assert.equal(buildStartCommand('C:\\Program Files\\IDE\\ide.exe', ['C:\\project']), 'start "" "C:\\Program Files\\IDE\\ide.exe" "C:\\project"')
  assert.throws(() => createManualLauncher({ name: 'IDE', executablePath: 'C:\\ide.exe', arguments: ['--open'] }), /must include \{workspace\}/)
})
