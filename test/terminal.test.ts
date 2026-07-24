import assert from 'node:assert/strict'
import test from 'node:test'
import { runTerminalCommand } from '../server/features/terminal/terminal.ts'

test('exécute une commande dans le cwd et conserve ses sorties', async () => {
  const result = await runTerminalCommand(process.cwd(), "printf '%s' \"$PWD\"; printf 'erreur' >&2; exit 7")

  assert.equal(result.stdout, process.cwd())
  assert.equal(result.stderr, 'erreur')
  assert.equal(result.exitCode, 7)
  assert.equal(result.timedOut, false)
})
