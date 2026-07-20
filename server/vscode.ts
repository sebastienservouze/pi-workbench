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
export function openVsCode(workspacePath: string): Promise<void> {
  return openApplication('code', workspacePath)
}

// Ouvre le dossier WSL dans l'Explorateur Windows sans lier sa durée de vie au backend.
export function openExplorer(workspacePath: string): Promise<void> {
  return openApplication('explorer.exe', workspacePath)
}

// Détache l'application Windows pour que le redémarrage du backend ne la ferme jamais.
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
