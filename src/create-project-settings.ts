import * as vscode from 'vscode'

export async function createProjectSettings() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const uri = vscode.Uri.joinPath(
    folder.uri,
    '.vscode',
    'project-settings.json',
  )

  try {
    await vscode.workspace.fs.stat(uri)
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc)
    return
  } catch {
    // File doesn't exist, create it
  }

  const vscodeDir = vscode.Uri.joinPath(folder.uri, '.vscode')
  await vscode.workspace.fs.createDirectory(vscodeDir)

  const content = new TextEncoder().encode('{\n  \n}\n')
  await vscode.workspace.fs.writeFile(uri, content)

  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
}
