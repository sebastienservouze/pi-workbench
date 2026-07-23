import { exec } from 'node:child_process'
import type { TerminalCommandResult } from '../shared/types.ts'

const maxOutputBytes = 1_000_000
const timeoutMs = 10 * 60_000

/** Exécute une commande isolée dans le workspace sans conserver d’état de shell entre deux appels. */
export function runTerminalCommand(cwd: string, command: string): Promise<TerminalCommandResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, encoding: 'utf8', maxBuffer: maxOutputBytes, timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        command,
        stdout,
        stderr,
        exitCode: error ? typeof error.code === 'number' ? error.code : null : 0,
        timedOut: error?.killed === true,
      })
    })
  })
}
