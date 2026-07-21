import { spawn } from 'node:child_process'

/** Vérifie la présence du lanceur sans exécuter VS Code ni déclencher son installation WSL. */
export async function isVsCodeAvailable(command = 'code'): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn('which', [command], { stdio: 'ignore' })
    process.once('error', () => resolve(false))
    process.once('exit', (code) => resolve(code === 0))
  })
}

/** Lance VS Code de façon détachée afin que le backend ne soit pas lié à la durée de l'éditeur. */
export function openVsCode(workspacePath: string): Promise<void> {
  return openApplication('code', workspacePath)
}

/** Ouvre le dossier WSL dans l'Explorateur Windows sans lier sa durée de vie au backend. */
export async function openExplorer(workspacePath: string): Promise<void> {
  await openApplication('explorer.exe', await windowsWorkspacePath(workspacePath))
}

/** Convertit un chemin WSL en chemin Windows, seul format interprété correctement par l'Explorateur. */
export function windowsWorkspacePath(workspacePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn('wslpath', ['-w', workspacePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    process.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    process.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString('utf8') })
    process.once('error', reject)
    process.once('exit', (code) => {
      const windowsPath = output.trim()
      if (code === 0 && windowsPath) resolve(windowsPath)
      else reject(new Error(errorOutput.trim() || `wslpath exited with code ${code}`))
    })
  })
}

/** Détache l'application Windows pour que le redémarrage du backend ne la ferme jamais. */
function openApplication(command: string, workspacePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, [workspacePath], { detached: true, stdio: 'ignore' })
    process.once('error', reject)
    process.once('spawn', () => {
      process.unref()
      resolve()
    })
  })
}
