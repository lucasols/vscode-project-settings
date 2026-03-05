import * as vscode from 'vscode'
import { syncSettings } from './sync'
import { createProjectSettings } from './create-project-settings'

export function activate(context: vscode.ExtensionContext) {
  syncAllWorkspaceFolders()

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.vscode/project-settings.json',
  )

  watcher.onDidChange((uri) => syncForFile(uri))
  watcher.onDidCreate((uri) => syncForFile(uri))

  context.subscriptions.push(watcher)

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'projectSettings.createProjectSettings',
      createProjectSettings,
    ),
    vscode.commands.registerCommand(
      'projectSettings.syncNow',
      syncAllWorkspaceFolders,
    ),
  )
}

export function deactivate() {}

async function syncAllWorkspaceFolders() {
  const folders = vscode.workspace.workspaceFolders
  if (!folders) return

  for (const folder of folders) {
    await syncWorkspaceFolder(folder.uri)
  }
}

async function syncForFile(projectSettingsUri: vscode.Uri) {
  const folder = vscode.workspace.getWorkspaceFolder(projectSettingsUri)
  if (!folder) return
  await syncWorkspaceFolder(folder.uri)
}

async function syncWorkspaceFolder(folderUri: vscode.Uri) {
  const projectSettingsUri = vscode.Uri.joinPath(
    folderUri,
    '.vscode',
    'project-settings.json',
  )
  const settingsUri = vscode.Uri.joinPath(
    folderUri,
    '.vscode',
    'settings.json',
  )

  let projectSettingsContent: string
  try {
    projectSettingsContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(projectSettingsUri),
    )
  } catch {
    return
  }

  let settingsContent = ''
  try {
    settingsContent = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(settingsUri),
    )
  } catch {
    // settings.json doesn't exist yet
  }

  try {
    const result = syncSettings(settingsContent, projectSettingsContent)
    await vscode.workspace.fs.writeFile(
      settingsUri,
      new TextEncoder().encode(result),
    )
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`Project Settings: ${error.message}`)
    }
  }
}
