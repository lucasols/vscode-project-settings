import * as vscode from 'vscode'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

type SyncModule = typeof import('./sync')
type CreateProjectSettingsModule = typeof import('./create-project-settings')

let syncModulePromise: Promise<SyncModule> | undefined
let createProjectSettingsModulePromise:
  | Promise<CreateProjectSettingsModule>
  | undefined

export function activate(context: vscode.ExtensionContext) {
  const watcherManager = createWatcherManager()
  const initialSyncTimeout = setTimeout(() => {
    void syncAllWorkspaceFolders()
  }, 0)

  context.subscriptions.push(
    watcherManager,
    {
      dispose() {
        clearTimeout(initialSyncTimeout)
      },
    },
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      watcherManager.refresh()

      for (const folder of event.added) {
        void syncWorkspaceFolder(folder.uri)
      }
    }),
    vscode.commands.registerCommand(
      'projectSettings.createProjectSettings',
      async () => {
        const { createProjectSettings } = await loadCreateProjectSettingsModule()
        await createProjectSettings()
      },
    ),
    vscode.commands.registerCommand('projectSettings.syncNow', syncAllWorkspaceFolders),
  )
}

export function deactivate() {}

async function syncAllWorkspaceFolders() {
  const folders = vscode.workspace.workspaceFolders
  if (!folders) return

  await Promise.all(folders.map((folder) => syncWorkspaceFolder(folder.uri)))
}

async function syncForFile(projectSettingsUri: vscode.Uri) {
  const folder = vscode.workspace.getWorkspaceFolder(projectSettingsUri)
  if (!folder) return
  await syncWorkspaceFolder(folder.uri)
}

async function removeSyncForFile(projectSettingsUri: vscode.Uri) {
  const folder = vscode.workspace.getWorkspaceFolder(projectSettingsUri)
  if (!folder) return
  await removeSyncedSettingsFromWorkspaceFolder(folder.uri)
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

  const projectSettingsContent = await readTextFile(projectSettingsUri)
  if (projectSettingsContent === undefined) {
    return
  }

  try {
    const [settingsContent, { syncSettings }] = await Promise.all([
      readTextFile(settingsUri, ''),
      loadSyncModule(),
    ])
    const result = syncSettings(settingsContent, projectSettingsContent)
    if (result === settingsContent) {
      return
    }

    await vscode.workspace.fs.writeFile(
      settingsUri,
      textEncoder.encode(result),
    )
  } catch (error) {
    showProjectSettingsError(error)
  }
}

async function removeSyncedSettingsFromWorkspaceFolder(folderUri: vscode.Uri) {
  const settingsUri = vscode.Uri.joinPath(
    folderUri,
    '.vscode',
    'settings.json',
  )

  const settingsContent = await readTextFile(settingsUri)
  if (settingsContent === undefined) {
    return
  }

  try {
    const { removeSyncedSettings } = await loadSyncModule()
    const result = removeSyncedSettings(settingsContent)
    if (result === settingsContent) {
      return
    }

    await vscode.workspace.fs.writeFile(
      settingsUri,
      textEncoder.encode(result),
    )
  } catch (error) {
    showProjectSettingsError(error)
  }
}

function createWatcherManager(): vscode.Disposable & { refresh(): void } {
  const watchers = new Map<string, vscode.Disposable>()

  const refresh = () => {
    const folders = vscode.workspace.workspaceFolders ?? []
    const activeFolderUris = new Set(folders.map((folder) => folder.uri.toString()))

    for (const folder of folders) {
      const folderKey = folder.uri.toString()
      if (!watchers.has(folderKey)) {
        watchers.set(folderKey, createWatcher(folder))
      }
    }

    for (const [folderKey, watcher] of watchers) {
      if (!activeFolderUris.has(folderKey)) {
        watcher.dispose()
        watchers.delete(folderKey)
      }
    }
  }

  refresh()

  return {
    refresh,
    dispose() {
      for (const watcher of watchers.values()) {
        watcher.dispose()
      }
      watchers.clear()
    },
  }
}

function createWatcher(folder: vscode.WorkspaceFolder): vscode.Disposable {
  const disposables: vscode.Disposable[] = []
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '.vscode/project-settings.json'),
  )

  disposables.push(watcher)
  watcher.onDidChange((uri) => void syncForFile(uri), undefined, disposables)
  watcher.onDidCreate((uri) => void syncForFile(uri), undefined, disposables)
  watcher.onDidDelete((uri) => void removeSyncForFile(uri), undefined, disposables)

  return {
    dispose() {
      for (const disposable of disposables.splice(0)) {
        disposable.dispose()
      }
    },
  }
}

function loadSyncModule() {
  syncModulePromise ??= import('./sync')
  return syncModulePromise
}

function loadCreateProjectSettingsModule() {
  createProjectSettingsModulePromise ??= import('./create-project-settings')
  return createProjectSettingsModulePromise
}

async function readTextFile(uri: vscode.Uri): Promise<string | undefined>
async function readTextFile(uri: vscode.Uri, fallback: string): Promise<string>
async function readTextFile(uri: vscode.Uri, fallback?: string) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri)
    return textDecoder.decode(bytes)
  } catch {
    return fallback
  }
}

function showProjectSettingsError(error: unknown) {
  if (error instanceof Error) {
    vscode.window.showErrorMessage(`Project Settings: ${error.message}`)
  }
}
