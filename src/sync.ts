import { parseTree, type Node } from 'jsonc-parser'

const MARKER_KEY = '----'
const MARKER_VALUE =
  '---- Managed by project-settings (do not edit below) ----'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getPropertyKey(node: Node): string | undefined {
  const keyNode = node.children?.[0]
  if (keyNode?.type === 'string' && typeof keyNode.value === 'string') {
    return keyNode.value
  }
  return undefined
}

function extractKeys(properties: Node[]): Set<string> {
  const keys = new Set<string>()
  for (const prop of properties) {
    const key = getPropertyKey(prop)
    if (key !== undefined) {
      keys.add(key)
    }
  }
  return keys
}

function findMarkerIndex(children: Node[]): number {
  return children.findIndex((prop) => getPropertyKey(prop) === MARKER_KEY)
}

function parseSettingsTree(settingsContent: string): Node {
  const tree = parseTree(settingsContent, undefined, {
    allowTrailingComma: true,
  })
  if (!tree || tree.type !== 'object') {
    throw new Error('settings.json must be a JSON object')
  }
  return tree
}

function removeFirstComma(text: string): string {
  const commaIndex = text.indexOf(',')
  if (commaIndex < 0) {
    return text
  }
  return text.slice(0, commaIndex) + text.slice(commaIndex + 1)
}

function formatJsonValue(value: unknown, indent: string): string {
  const json = JSON.stringify(value, null, 2)
  return json.split('\n').join(`\n${indent}`)
}

function buildSyncedSection(
  projectSettings: Record<string, unknown>,
  userKeys: Set<string>,
): string {
  const markerLine = `  ${JSON.stringify(MARKER_KEY)}: ${JSON.stringify(MARKER_VALUE)}`

  const entries: string[] = []
  for (const [key, value] of Object.entries(projectSettings)) {
    if (userKeys.has(key)) continue
    entries.push(`  ${JSON.stringify(key)}: ${formatJsonValue(value, '  ')}`)
  }

  if (entries.length === 0) {
    return markerLine
  }

  return `${markerLine},\n${entries.join(',\n')}`
}

function parseProjectSettings(content: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('project-settings.json contains invalid JSON')
  }
  if (!isRecord(parsed)) {
    throw new Error('project-settings.json must be a JSON object')
  }
  return parsed
}

export function syncSettings(
  settingsContent: string,
  projectSettingsContent: string,
): string {
  const projectSettings = parseProjectSettings(projectSettingsContent)

  if (!settingsContent.trim()) {
    const syncedSection = buildSyncedSection(projectSettings, new Set())
    return `{\n${syncedSection}\n}\n`
  }

  const tree = parseSettingsTree(settingsContent)
  const children = tree.children ?? []
  const markerIndex = findMarkerIndex(children)

  let userText: string
  let userKeys: Set<string>
  let hasUserProps: boolean

  if (markerIndex >= 0) {
    const markerNode = children[markerIndex]
    if (!markerNode) {
      throw new Error('Unexpected: marker node not found')
    }
    userText = settingsContent.slice(0, markerNode.offset)
    userKeys = extractKeys(children.slice(0, markerIndex))
    hasUserProps = markerIndex > 0
  } else {
    const closingBrace = settingsContent.lastIndexOf('}')
    if (closingBrace < 0) {
      throw new Error('settings.json is missing closing brace')
    }
    userText = settingsContent.slice(0, closingBrace)
    userKeys = extractKeys(children)
    hasUserProps = children.length > 0
  }

  const syncedSection = buildSyncedSection(projectSettings, userKeys)
  const trimmed = userText.trimEnd()
  const needsComma = hasUserProps && !trimmed.endsWith(',')
  const comma = needsComma ? ',' : ''

  return `${trimmed}${comma}\n\n${syncedSection}\n}\n`
}

export function removeSyncedSettings(settingsContent: string): string {
  if (!settingsContent.trim()) {
    return settingsContent
  }

  const tree = parseSettingsTree(settingsContent)
  const children = tree.children ?? []
  const markerIndex = findMarkerIndex(children)

  if (markerIndex < 0) {
    return settingsContent
  }

  const markerNode = children[markerIndex]
  if (!markerNode) {
    throw new Error('Unexpected: marker node not found')
  }

  if (markerIndex === 0) {
    return `${settingsContent.slice(0, markerNode.offset).trimEnd()}\n}\n`
  }

  const previousNode = children[markerIndex - 1]
  if (!previousNode) {
    throw new Error('Unexpected: previous node not found')
  }

  const prefix = settingsContent.slice(0, previousNode.offset + previousNode.length)
  const separator = settingsContent.slice(
    previousNode.offset + previousNode.length,
    markerNode.offset,
  )

  return `${prefix}${removeFirstComma(separator).trimEnd()}\n}\n`
}
