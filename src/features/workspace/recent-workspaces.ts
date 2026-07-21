export const recentWorkspaceLimit = 5

export function recentWorkspaces(workspacePath: string, workspaces: readonly string[]): string[] {
  return [workspacePath, ...workspaces]
    .filter((path, index, all) => path.length > 0 && all.indexOf(path) === index)
    .slice(0, recentWorkspaceLimit)
}
