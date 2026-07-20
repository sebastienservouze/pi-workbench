import { spawn } from 'node:child_process'

// Vérifie la présence du lanceur sans exécuter VS Code ni déclencher son installation WSL.
export async function isVsCodeAvailable(command = 'code'): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn('which', [command], { stdio: 'ignore' })
    process.once('error', () => resolve(false))
    process.once('exit', (code) => resolve(code === 0))
  })
}

// Lance VS Code de façon détachée afin que le backend ne soit pas lié à la durée de l'éditeur.
export async function openVsCode(workspacePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn('code', [workspacePath], { detached: true, stdio: 'ignore' })
    process.once('error', reject)
    process.once('spawn', () => {
      process.unref()
      resolve()
    })
  })
}
