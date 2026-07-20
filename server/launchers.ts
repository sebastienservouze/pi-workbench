import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Launcher, LauncherProduct, LauncherRegistry, LauncherSnapshot } from '../shared/types.ts'

const defaultRegistryPath = process.env.PI_WORKBENCH_LAUNCHER_REGISTRY
  ?? join(homedir(), '.pi-workbench', 'launchers.json')

const productNames: Record<LauncherProduct, string> = {
  vscode: 'VS Code',
  visualstudio: 'Visual Studio',
  intellij: 'IntelliJ IDEA',
  rider: 'Rider',
  pycharm: 'PyCharm',
  phpstorm: 'PhpStorm',
  webstorm: 'WebStorm',
  androidstudio: 'Android Studio',
  custom: 'Lanceur personnalisé',
}

const productExecutables: Record<Exclude<LauncherProduct, 'custom'>, string> = {
  vscode: 'Code.exe',
  visualstudio: 'devenv.exe',
  intellij: 'idea64.exe',
  rider: 'rider64.exe',
  pycharm: 'pycharm64.exe',
  phpstorm: 'phpstorm64.exe',
  webstorm: 'webstorm64.exe',
  androidstudio: 'studio64.exe',
}

interface DetectedLauncher {
  product: Exclude<LauncherProduct, 'custom'>
  executablePath: string
  version: string
}

// Charge le registre local ou retourne une structure vide lors du premier démarrage.
export async function loadLauncherRegistry(path = defaultRegistryPath): Promise<LauncherRegistry> {
  try {
    return parseLauncherRegistry(await readFile(path, 'utf8'))
  } catch (error) {
    if (isNotFound(error)) return { launchers: [], workspaceLauncherIds: {} }
    throw error
  }
}

// Écrit le registre atomiquement afin qu'une interruption ne laisse jamais de JSON tronqué.
export async function saveLauncherRegistry(registry: LauncherRegistry, path = defaultRegistryPath): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, path)
}

export function parseLauncherRegistry(content: string): LauncherRegistry {
  const value: unknown = JSON.parse(content)
  if (!isRegistry(value)) throw new Error('Invalid Pi Workbench launcher registry')
  if (new Set(value.launchers.map(({ id }) => id)).size !== value.launchers.length) throw new Error('Duplicate launcher in Pi Workbench registry')
  if (value.lastLauncherId && !value.launchers.some(({ id }) => id === value.lastLauncherId)) throw new Error('Unknown last launcher in Pi Workbench registry')
  if (Object.values(value.workspaceLauncherIds).some((id) => !value.launchers.some((launcher) => launcher.id === id))) throw new Error('Unknown workspace launcher in Pi Workbench registry')
  return value
}

// Fusionne les dernières installations détectées sans effacer les lanceurs manuels de l'utilisateur.
export function mergeDetectedLaunchers(registry: LauncherRegistry, detected: DetectedLauncher[]): LauncherRegistry {
  const launchers = [...registry.launchers]
  for (const item of latestDetectedLaunchers(detected)) {
    const existing = launchers.find((launcher) => launcher.source === 'detected' && launcher.executablePath.toLowerCase() === item.executablePath.toLowerCase())
    if (existing) {
      existing.version = item.version
      continue
    }
    launchers.push({
      id: detectedLauncherId(item.product, item.executablePath),
      name: productNames[item.product],
      product: item.product,
      source: 'detected',
      executablePath: item.executablePath,
      arguments: ['{workspace}'],
      version: item.version,
    })
  }
  return { ...registry, launchers }
}

// N'affiche que la version détectée la plus récente de chaque IDE et conserve tous les lanceurs manuels.
export function launcherSnapshot(registry: LauncherRegistry, workspacePath: string): LauncherSnapshot {
  const launchers = visibleLaunchers(registry.launchers)
  const preferredLauncherId = registry.workspaceLauncherIds[workspacePath] ?? registry.lastLauncherId
  const selectedLauncherId = launchers.some(({ id }) => id === preferredLauncherId) ? preferredLauncherId : undefined
  return { launchers, selectedLauncherId }
}

// Associe un lanceur existant à un workspace sans modifier le dernier lancement global.
export function selectWorkspaceLauncher(registry: LauncherRegistry, workspacePath: string, launcherId: string): LauncherRegistry {
  if (!registry.launchers.some((launcher) => launcher.id === launcherId)) throw new Error('Unknown launcher')
  return { ...registry, workspaceLauncherIds: { ...registry.workspaceLauncherIds, [workspacePath]: launcherId } }
}

// Mémorise le dernier lancement après la création réussie du processus détaché.
export function recordLauncherLaunch(registry: LauncherRegistry, launcherId: string): LauncherRegistry {
  if (!registry.launchers.some((launcher) => launcher.id === launcherId)) throw new Error('Unknown launcher')
  return { ...registry, lastLauncherId: launcherId }
}

// Crée un lanceur manuel ; les arguments restent structurés pour ne jamais interpréter une ligne shell libre.
export function createManualLauncher(input: { name: string; executablePath: string; arguments: string[] }): Launcher {
  const name = input.name.trim()
  const executablePath = input.executablePath.trim()
  const launcherArguments = input.arguments.map((argument) => argument.trim()).filter(Boolean)
  if (!name || !executablePath) throw new Error('Launcher name and executable path are required')
  if (!launcherArguments.some((argument) => argument.includes('{workspace}'))) throw new Error('Launcher arguments must include {workspace}')
  return { id: randomUUID(), name, product: 'custom', source: 'manual', executablePath, arguments: launcherArguments }
}

// Détecte les binaires Windows usuels, y compris les installations JetBrains Toolbox, sans accès réseau.
export async function detectWindowsLaunchers(): Promise<DetectedLauncher[]> {
  const output = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', detectionScript])
  return parseDetectedLaunchers(output)
}

export function parseDetectedLaunchers(output: string): DetectedLauncher[] {
  const trimmed = output.trim()
  if (!trimmed) return []
  const value: unknown = JSON.parse(trimmed)
  const items = Array.isArray(value) ? value : [value]
  const detected: DetectedLauncher[] = []
  for (const item of items) {
    if (!isObject(item) || !isKnownProduct(item.product) || typeof item.executablePath !== 'string' || !item.executablePath || typeof item.version !== 'string') continue
    const executablePath = item.executablePath
    if (!detected.some((current) => current.executablePath.toLowerCase() === executablePath.toLowerCase())) {
      detected.push({ product: item.product, executablePath, version: item.version })
    }
  }
  return latestDetectedLaunchers(detected)
}

// Lance le wrapper WSL de VS Code, qui sait ouvrir le workspace dans la distribution courante.
export async function launchCodeWorkspace(workspacePath: string): Promise<void> {
  await spawnDetached('code', [workspacePath])
}

// Lance l'IDE Windows via start et renvoie la commande construite pour les tests et diagnostics locaux.
export async function launchWorkspace(launcher: Launcher, workspacePath: string): Promise<string> {
  const windowsWorkspace = (await runProcess('wslpath', ['-w', workspacePath])).trim()
  if (!windowsWorkspace) throw new Error('Unable to convert workspace path to Windows')
  const argumentsForLaunch = launcher.product === 'vscode'
    ? vsCodeArguments(windowsWorkspace)
    : launcher.arguments.map((argument) => argument.replaceAll('{workspace}', windowsWorkspace))
  const command = buildStartCommand(launcher.executablePath, argumentsForLaunch)
  await spawnDetached('cmd.exe', ['/d', '/s', '/c', command])
  return command
}

export function buildStartCommand(executablePath: string, argumentsForLaunch: string[]): string {
  return `start "" ${[executablePath, ...argumentsForLaunch].map(quoteForCmd).join(' ')}`
}

export function vsCodeArguments(windowsWorkspace: string): string[] {
  const remoteWorkspace = windowsWorkspace.match(/^\\\\wsl(?:\.localhost)?\\([^\\]+)\\(.*)$/i)
  if (!remoteWorkspace) return [windowsWorkspace]
  const [, distribution, path] = remoteWorkspace
  const encodedPath = path.split('\\').map(encodeURIComponent).join('/')
  return ['--folder-uri', `vscode-remote://wsl+${encodeURIComponent(distribution)}/${encodedPath}`]
}

function quoteForCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

// Conserve un seul candidat détecté par produit : celui dont la version est la plus élevée.
function latestDetectedLaunchers(detected: DetectedLauncher[]): DetectedLauncher[] {
  const latest = new Map<DetectedLauncher['product'], DetectedLauncher>()
  for (const item of detected) {
    const current = latest.get(item.product)
    if (!current || compareVersions(item.version, current.version) > 0) latest.set(item.product, item)
  }
  return [...latest.values()].sort((left, right) => left.product.localeCompare(right.product))
}

// Masque les anciennes installations automatiques tout en laissant les lanceurs manuels intacts.
function visibleLaunchers(launchers: Launcher[]): Launcher[] {
  const detected = latestDetectedLaunchers(launchers
    .filter((launcher) => launcher.source === 'detected' && launcher.product !== 'vscode')
    .map((launcher) => ({ product: launcher.product as Exclude<LauncherProduct, 'custom' | 'vscode'>, executablePath: launcher.executablePath, version: launcher.version ?? '' })))
  const detectedPaths = new Set(detected.map(({ executablePath }) => executablePath))
  return launchers.filter((launcher) => launcher.source === 'manual' || detectedPaths.has(launcher.executablePath))
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.match(/\d+/g)?.map(Number) ?? []
  const rightParts = right.match(/\d+/g)?.map(Number) ?? []
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference) return difference
  }
  return left.localeCompare(right)
}

function detectedLauncherId(product: LauncherProduct, executablePath: string): string {
  return `${product}-${createHash('sha256').update(executablePath.toLowerCase()).digest('hex').slice(0, 12)}`
}

function isRegistry(value: unknown): value is LauncherRegistry {
  if (!isObject(value) || !Array.isArray(value.launchers) || !isObject(value.workspaceLauncherIds)) return false
  if (value.lastLauncherId !== undefined && typeof value.lastLauncherId !== 'string') return false
  if (!value.launchers.every(isLauncher)) return false
  return Object.entries(value.workspaceLauncherIds).every(([workspace, launcherId]) => workspace.length > 0 && typeof launcherId === 'string' && launcherId.length > 0)
}

function isLauncher(value: unknown): value is Launcher {
  return isObject(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.length > 0
    && isProduct(value.product)
    && (value.source === 'detected' || value.source === 'manual')
    && typeof value.executablePath === 'string' && value.executablePath.length > 0
    && (value.version === undefined || typeof value.version === 'string')
    && Array.isArray(value.arguments) && value.arguments.every((argument) => typeof argument === 'string')
    && (value.product !== 'custom' || value.arguments.some((argument) => argument.includes('{workspace}')))
}

function isProduct(value: unknown): value is LauncherProduct {
  return typeof value === 'string' && value in productNames
}

function isKnownProduct(value: unknown): value is Exclude<LauncherProduct, 'custom'> {
  return typeof value === 'string' && value !== 'custom' && value in productExecutables
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}

// Collecte la sortie d'une commande locale et conserve stderr pour rendre les échecs Windows actionnables.
function runProcess(command: string, argumentsForProcess: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, argumentsForProcess, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    process.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    process.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString('utf8') })
    process.once('error', reject)
    process.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(errorOutput.trim() || `${command} exited with code ${code}`)))
  })
}

// Détache l'IDE du backend : son arrêt ou son redémarrage ne ferme jamais l'éditeur lancé.
function spawnDetached(command: string, argumentsForProcess: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, argumentsForProcess, { detached: true, stdio: 'ignore', windowsHide: true })
    process.once('error', reject)
    process.once('spawn', () => { process.unref(); resolve() })
  })
}

const detectionScript = `$ErrorActionPreference = 'SilentlyContinue'
$items = @()
$patterns = @(
  @{ product = 'intellij'; paths = @("$env:ProgramFiles\\JetBrains\\*\\bin\\idea64.exe", "$env:LOCALAPPDATA\\JetBrains\\Toolbox\\apps\\*\\*\\*\\bin\\idea64.exe") },
  @{ product = 'visualstudio'; paths = @("\${env:ProgramFiles(x86)}\\Microsoft Visual Studio\\Installer\\vswhere.exe") },
  @{ product = 'rider'; paths = @("$env:ProgramFiles\\JetBrains\\*\\bin\\rider64.exe", "$env:LOCALAPPDATA\\JetBrains\\Toolbox\\apps\\*\\*\\*\\bin\\rider64.exe") },
  @{ product = 'pycharm'; paths = @("$env:ProgramFiles\\JetBrains\\*\\bin\\pycharm64.exe", "$env:LOCALAPPDATA\\JetBrains\\Toolbox\\apps\\*\\*\\*\\bin\\pycharm64.exe") },
  @{ product = 'phpstorm'; paths = @("$env:ProgramFiles\\JetBrains\\*\\bin\\phpstorm64.exe", "$env:LOCALAPPDATA\\JetBrains\\Toolbox\\apps\\*\\*\\*\\bin\\phpstorm64.exe") },
  @{ product = 'webstorm'; paths = @("$env:ProgramFiles\\JetBrains\\*\\bin\\webstorm64.exe", "$env:LOCALAPPDATA\\JetBrains\\Toolbox\\apps\\*\\*\\*\\bin\\webstorm64.exe") },
  @{ product = 'androidstudio'; paths = @("$env:ProgramFiles\\Android\\Android Studio\\bin\\studio64.exe", "$env:LOCALAPPDATA\\Google\\AndroidStudio*\\bin\\studio64.exe") }
)
foreach ($pattern in $patterns) {
  foreach ($path in $pattern.paths) {
    Get-Item -Path $path | ForEach-Object {
      if ($pattern.product -eq 'visualstudio') {
        & $_.FullName -latest -products * -property installationPath -format value | ForEach-Object {
          $executablePath = Join-Path $_ 'Common7\\IDE\\devenv.exe'
          if (Test-Path $executablePath) { $items += [PSCustomObject]@{ product = 'visualstudio'; executablePath = $executablePath; version = (Get-Item $executablePath).VersionInfo.ProductVersion } }
        }
      } else {
        $items += [PSCustomObject]@{ product = $pattern.product; executablePath = $_.FullName; version = $_.VersionInfo.ProductVersion }
      }
    }
  }
}
$items | Sort-Object executablePath -Unique | ConvertTo-Json -Compress`
