import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStartCommand, createManualLauncher, launcherSnapshot, mergeDetectedLaunchers, parseDetectedLaunchers, parseLauncherRegistry, recordLauncherLaunch, selectWorkspaceLauncher, vsCodeArguments } from '../server/launchers.ts'
import type { LauncherRegistry } from '../shared/types.ts'

const registry: LauncherRegistry = {
  launchers: [{ id: 'code', name: 'VS Code', product: 'vscode', source: 'detected', executablePath: 'C:\\Code.exe', arguments: ['{workspace}'] }],
  workspaceLauncherIds: {},
}

test('mémorise un lanceur par workspace et retombe sur le dernier lancement', () => {
  const selected = selectWorkspaceLauncher(registry, '/workspace/a', 'code')
  assert.equal(launcherSnapshot(selected, '/workspace/a').selectedLauncherId, 'code')
  assert.equal(launcherSnapshot(selected, '/workspace/b').selectedLauncherId, undefined)
  assert.equal(launcherSnapshot(recordLauncherLaunch(selected, 'code'), '/workspace/b').selectedLauncherId, 'code')
})

test('valide le registre et fusionne une détection sans dupliquer le binaire', () => {
  assert.deepEqual(parseLauncherRegistry(JSON.stringify(registry)), registry)
  assert.throws(() => parseLauncherRegistry('{"launchers":[],"workspaceLauncherIds":{"/workspace":"missing"}}'), /Unknown workspace launcher/)
  const merged = mergeDetectedLaunchers(registry, parseDetectedLaunchers('{"product":"vscode","executablePath":"C:\\\\Code.exe"}'))
  assert.equal(merged.launchers.length, 1)
})

test('prépare les commandes Windows sans shell libre et traite les workspaces WSL de VS Code', () => {
  assert.deepEqual(vsCodeArguments('\\\\wsl.localhost\\Ubuntu\\home\\user\\project'), ['--folder-uri', 'vscode-remote://wsl+Ubuntu/home/user/project'])
  assert.equal(buildStartCommand('C:\\Program Files\\IDE\\ide.exe', ['C:\\project']), 'start "" "C:\\Program Files\\IDE\\ide.exe" "C:\\project"')
  assert.throws(() => createManualLauncher({ name: 'IDE', executablePath: 'C:\\ide.exe', arguments: ['--open'] }), /must include \{workspace\}/)
})
