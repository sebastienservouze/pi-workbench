import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Launcher, LauncherRegistry, LauncherSnapshot } from '../shared/types.ts'

const defaultRegistryPath = process.env.PI_WORKBENCH_LAUNCHER_REGISTRY
  ?? join(homedir(), '.pi-workbench', 'launchers.json')
const windowsPickerTimeoutMs = 5 * 60_000

interface SelectedExecutable {
  executablePath: string
  name: string
}

// Charge les lanceurs mémorisés ; le registre historique reste lisible pour ne pas perdre les choix existants.
export async function loadLauncherRegistry(path = defaultRegistryPath): Promise<LauncherRegistry> {
  try {
    return parseLauncherRegistry(await readFile(path, 'utf8'))
  } catch (error) {
    if (isNotFound(error)) return { launchers: [], workspaceLauncherIds: {} }
    throw error
  }
}

// Écrit le registre atomiquement afin qu'une interruption ne laisse jamais une préférence tronquée.
export async function saveLauncherRegistry(registry: LauncherRegistry, path = defaultRegistryPath): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, path)
}

// Valide le registre et migre le dernier choix historique vers le nom explicite de lanceur par défaut.
export function parseLauncherRegistry(content: string): LauncherRegistry {
  const value: unknown = JSON.parse(content)
  if (!isObject(value) || !Array.isArray(value.launchers) || !isObject(value.workspaceLauncherIds) || !value.launchers.every(isLauncher)) throw new Error('Invalid Pi Workbench launcher registry')
  const launchers = value.launchers as Launcher[]
  if (new Set(launchers.map(({ id }) => id)).size !== launchers.length) throw new Error('Duplicate launcher in Pi Workbench registry')
  const defaultLauncherId = stringValue(value.defaultLauncherId) ?? stringValue(value.lastLauncherId)
  if (defaultLauncherId && !launchers.some(({ id }) => id === defaultLauncherId)) throw new Error('Unknown default launcher in Pi Workbench registry')
  const workspaceLauncherIds = Object.entries(value.workspaceLauncherIds).reduce<Record<string, string>>((ids, [workspace, launcherId]) => {
    if (workspace && typeof launcherId === 'string' && launchers.some(({ id }) => id === launcherId)) ids[workspace] = launcherId
    return ids
  }, {})
  return { launchers, defaultLauncherId, workspaceLauncherIds }
}

// Retourne le choix propre au dossier ou le lanceur par défaut quand aucun choix local n'existe.
export function launcherSnapshot(registry: LauncherRegistry, workspacePath: string): LauncherSnapshot {
  const preferredLauncherId = registry.workspaceLauncherIds[workspacePath] ?? registry.defaultLauncherId
  const selectedLauncherId = registry.launchers.some(({ id }) => id === preferredLauncherId) ? preferredLauncherId : undefined
  return { launchers: registry.launchers, selectedLauncherId }
}

export function selectWorkspaceLauncher(registry: LauncherRegistry, workspacePath: string, launcherId: string): LauncherRegistry {
  if (!registry.launchers.some(({ id }) => id === launcherId)) throw new Error('Unknown launcher')
  return { ...registry, workspaceLauncherIds: { ...registry.workspaceLauncherIds, [workspacePath]: launcherId } }
}

// Ajoute un exécutable choisi par l'utilisateur ou réemploie le même chemin déjà mémorisé.
export function addPickedLauncher(registry: LauncherRegistry, executable: SelectedExecutable, iconDataUrl?: string): LauncherRegistry {
  const existing = registry.launchers.find((launcher) => launcher.executablePath.toLowerCase() === executable.executablePath.toLowerCase())
  if (existing) return iconDataUrl && !existing.iconDataUrl ? { ...registry, launchers: registry.launchers.map((launcher) => launcher.id === existing.id ? { ...launcher, iconDataUrl } : launcher) } : registry
  const launcher: Launcher = { id: randomUUID(), name: executable.name, executablePath: executable.executablePath, ...(iconDataUrl ? { iconDataUrl } : {}) }
  return { ...registry, launchers: [...registry.launchers, launcher], defaultLauncherId: registry.defaultLauncherId ?? launcher.id }
}

// Ouvre le sélecteur natif Windows et ne retourne rien lorsque l'utilisateur annule l'opération.
export async function pickWindowsLauncher(): Promise<SelectedExecutable | null> {
  const output = await runProcess('powershell.exe', pickerArguments(), windowsPickerTimeoutMs)
  if (!output.trim()) return null
  const value: unknown = JSON.parse(output)
  if (!isObject(value) || typeof value.executablePath !== 'string' || !value.executablePath || typeof value.name !== 'string' || !value.name) throw new Error('Invalid executable selected in Windows')
  return { executablePath: value.executablePath, name: value.name }
}

// Extrait l'icône Windows en PNG afin que le navigateur puisse l'afficher sans accéder directement au disque Windows.
export async function executableIcon(executablePath: string): Promise<string | undefined> {
  const output = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', iconScript, executablePath])
  const base64 = output.trim()
  return /^[A-Za-z0-9+/]+={0,2}$/.test(base64) ? `data:image/png;base64,${base64}` : undefined
}

// Complète une seule fois les lanceurs anciens ou sélectionnés avant l'ajout de la persistance des icônes.
export async function ensureLauncherIcons(registry: LauncherRegistry): Promise<LauncherRegistry> {
  let changed = false
  const launchers = await Promise.all(registry.launchers.map(async (launcher) => {
    if (launcher.iconDataUrl) return launcher
    const iconDataUrl = await executableIcon(launcher.executablePath).catch(() => undefined)
    if (!iconDataUrl) return launcher
    changed = true
    return { ...launcher, iconDataUrl }
  }))
  return changed ? { ...registry, launchers } : registry
}

// Lance l'exécutable Windows détaché après conversion du dossier WSL en chemin Windows.
export async function launchWorkspace(launcher: Launcher, workspacePath: string): Promise<void> {
  const windowsWorkspace = (await runProcess('wslpath', ['-w', workspacePath])).trim()
  if (!windowsWorkspace) throw new Error('Unable to convert workspace path to Windows')
  await spawnDetached('cmd.exe', ['/d', '/s', '/c', `start "" ${quoteForCmd(launcher.executablePath)} ${quoteForCmd(windowsWorkspace)}`])
}

export function pickerArguments(): string[] {
  return ['-NoProfile', '-STA', '-Command', pickerScript]
}

function quoteForCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function isLauncher(value: unknown): value is Launcher {
  return isObject(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.length > 0
    && typeof value.executablePath === 'string' && value.executablePath.length > 0
    && (value.iconDataUrl === undefined || typeof value.iconDataUrl === 'string')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}

// Collecte la sortie d'une commande locale et limite l'attente des interfaces Windows qui ne se rendraient pas visibles.
function runProcess(command: string, argumentsForProcess: string[], timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, argumentsForProcess, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    const timeout = timeoutMs ? setTimeout(() => {
      process.kill()
      reject(new Error(`${command} did not respond within ${timeoutMs / 1000} seconds`))
    }, timeoutMs) : undefined

    function finish(callback: () => void): void {
      if (timeout) clearTimeout(timeout)
      callback()
    }

    process.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    process.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString('utf8') })
    process.once('error', (error) => finish(() => reject(error)))
    process.once('exit', (code) => finish(() => code === 0 ? resolve(output) : reject(new Error(errorOutput.trim() || `${command} exited with code ${code}`))))
  })
}

// Détache l'éditeur du backend : son arrêt ou son redémarrage ne ferme jamais l'application lancée.
function spawnDetached(command: string, argumentsForProcess: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, argumentsForProcess, { detached: true, stdio: 'ignore', windowsHide: true })
    process.once('error', reject)
    process.once('spawn', () => { process.unref(); resolve() })
  })
}

const pickerScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LauncherPickerWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = 'Applications (*.exe)|*.exe'
$dialog.CheckFileExists = $true
try {
  $owner.Show()
  $null = [LauncherPickerWindow]::SetForegroundWindow($owner.Handle)
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    $file = Get-Item -LiteralPath $dialog.FileName
    $name = $file.VersionInfo.FileDescription
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $file.BaseName }
    [PSCustomObject]@{ executablePath = $file.FullName; name = $name } | ConvertTo-Json -Compress
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}`

const iconScript = `param([string]$executablePath)
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($executablePath)
if ($null -ne $icon) {
  $stream = New-Object System.IO.MemoryStream
  try {
    $icon.ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    [Convert]::ToBase64String($stream.ToArray())
  } finally {
    $stream.Dispose()
    $icon.Dispose()
  }
}`
