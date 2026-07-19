import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const services = [
  { name: 'manager', args: ['--watch', 'server/manager.ts'] },
  { name: 'backend', args: ['--watch', 'server/backend.ts'] },
  { name: 'frontend', args: [resolve(rootDirectory, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'] },
]
let shuttingDown = false

const children = services.map(({ name, args }) => {
  console.log(`[dev] Démarrage de ${name}…`)
  const child = spawn(process.execPath, args, { cwd: rootDirectory, stdio: 'inherit' })
  child.once('error', (error) => {
    console.error(`[dev] Impossible de lancer ${name}: ${error.message}`)
    void shutdown(1)
  })
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[dev] ${name} s’est arrêté (${signal ?? code ?? 'inconnu'}).`)
    void shutdown(code || 1)
  })
  return child
})

process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  await Promise.race([waitForAll(children), delay(250)])
  for (const child of children) {
    if (isRunning(child)) child.kill('SIGTERM')
  }

  await Promise.race([waitForAll(children), delay(3_000)])
  for (const child of children) {
    if (isRunning(child)) child.kill('SIGKILL')
  }

  process.exit(exitCode)
}

function waitForAll(processes: ChildProcess[]): Promise<void> {
  return Promise.all(processes.map((child) => {
    if (!isRunning(child)) return Promise.resolve()
    return new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
  })).then(() => undefined)
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
