import { spawn } from 'node:child_process'

/** Checks for the launcher without running VS Code or triggering its WSL installation. */
export async function isVsCodeAvailable(command = 'code'): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn('which', [command], { stdio: 'ignore' })
    process.once('error', () => resolve(false))
    process.once('exit', (code) => resolve(code === 0))
  })
}

/** Launches VS Code detached so the backend is not tied to the editor's lifetime. */
export function openVsCode(workspacePath: string): Promise<void> {
  return openApplication('code', workspacePath)
}

/** Opens the WSL directory in Windows Explorer without tying its lifetime to the backend. */
export async function openExplorer(workspacePath: string): Promise<void> {
  await openApplication('explorer.exe', await windowsWorkspacePath(workspacePath))
}

/** Converts a WSL path to the Windows format understood by Explorer. */
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

/** Detaches the Windows application so restarting the backend never closes it. */
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
