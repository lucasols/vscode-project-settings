import { parseTree, type Node } from 'jsonc-parser'

const MARKER_KEY = '----'
const MARKER_VALUE = '---- Managed by project-settings ----'
const MARKER_END_KEY = '----end'
const MARKER_END_VALUE = '---- End of managed settings ----'

function at<T>(arr: readonly T[], index: number): T {
  const item = arr[index]
  if (item === undefined) {
    throw new Error(`Unexpected: index ${index} out of bounds`)
  }
  return item
}

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

function findKeyIndex(children: Node[], key: string): number {
  return children.findIndex((prop) => getPropertyKey(prop) === key)
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

function removeLeadingComma(text: string): string {
  return text.replace(/^\s*,/, '')
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
  const markerStart = `  ${JSON.stringify(MARKER_KEY)}: ${JSON.stringify(MARKER_VALUE)}`
  const markerEnd = `  ${JSON.stringify(MARKER_END_KEY)}: ${JSON.stringify(MARKER_END_VALUE)}`

  const entries: string[] = []
  for (const [key, value] of Object.entries(projectSettings)) {
    if (userKeys.has(key)) continue
    entries.push(`  ${JSON.stringify(key)}: ${formatJsonValue(value, '  ')}`)
  }

  if (entries.length === 0) {
    return `${markerStart},\n${markerEnd}`
  }

  return `${markerStart},\n${entries.join(',\n')},\n${markerEnd}`
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

/** Extract clean text block, preserving internal formatting but trimming empty boundary lines. */
function extractUserBlock(raw: string): string {
  const lines = raw.split('\n')
  let start = 0
  while (start < lines.length && at(lines, start).trim() === '') start++
  let end = lines.length - 1
  while (end >= start && at(lines, end).trim() === '') end--

  if (start > end) return ''

  return lines.slice(start, end + 1).join('\n')
}

/** Get user text block from settings content, handling all marker formats. */
function getUserText(
  content: string,
  children: Node[],
  startIdx: number,
  endIdx: number,
): string {
  const openBrace = content.indexOf('{')
  const closeBrace = content.lastIndexOf('}')

  if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
    // New format: managed at top with start+end markers
    const startNode = at(children, startIdx)
    const endNode = at(children, endIdx)

    const beforeRaw = content.slice(openBrace + 1, startNode.offset)
    const afterRaw = removeLeadingComma(
      content.slice(endNode.offset + endNode.length, closeBrace),
    )

    const beforeBlock = extractUserBlock(beforeRaw)
    const afterBlock = extractUserBlock(afterRaw)

    if (beforeBlock && afterBlock) {
      const before = beforeBlock.replace(/,?\s*$/, ',')
      return `${before}\n${afterBlock}`
    }
    return afterBlock || beforeBlock
  }

  if (startIdx >= 0) {
    // Old format: managed at bottom with single marker
    const markerNode = at(children, startIdx)
    const raw = content.slice(openBrace + 1, markerNode.offset)
    return extractUserBlock(raw)
  }

  // No markers: everything is user content
  return extractUserBlock(content.slice(openBrace + 1, closeBrace))
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

  const startIdx = findKeyIndex(children, MARKER_KEY)
  const endIdx = findKeyIndex(children, MARKER_END_KEY)

  let userProperties: Node[]

  if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
    userProperties = [
      ...children.slice(0, startIdx),
      ...children.slice(endIdx + 1),
    ]
  } else if (startIdx >= 0) {
    userProperties = children.slice(0, startIdx)
  } else {
    userProperties = children
  }

  const userKeys = extractKeys(userProperties)
  const syncedSection = buildSyncedSection(projectSettings, userKeys)

  if (userProperties.length === 0) {
    return `{\n${syncedSection}\n}\n`
  }

  const userBlock = getUserText(settingsContent, children, startIdx, endIdx)

  return `{\n${syncedSection},\n\n${userBlock}\n}\n`
}

export function removeSyncedSettings(settingsContent: string): string {
  if (!settingsContent.trim()) {
    return settingsContent
  }

  const tree = parseSettingsTree(settingsContent)
  const children = tree.children ?? []
  const startIdx = findKeyIndex(children, MARKER_KEY)
  const endIdx = findKeyIndex(children, MARKER_END_KEY)

  if (startIdx < 0) {
    return settingsContent
  }

  if (endIdx >= 0 && endIdx > startIdx) {
    // New format: start + end markers
    const startNode = at(children, startIdx)
    const endNode = at(children, endIdx)
    const closeBrace = settingsContent.lastIndexOf('}')

    const beforeRaw = settingsContent.slice(
      settingsContent.indexOf('{') + 1,
      startNode.offset,
    )
    const afterRaw = removeLeadingComma(
      settingsContent.slice(endNode.offset + endNode.length, closeBrace),
    )

    const beforeBlock = extractUserBlock(beforeRaw)
    const afterBlock = extractUserBlock(afterRaw)

    const parts = [beforeBlock, afterBlock].filter(Boolean)

    if (parts.length === 0) {
      return `{\n}\n`
    }

    if (parts.length === 2) {
      const before = at(parts, 0).replace(/,?\s*$/, ',')
      return `{\n${before}\n${parts[1]}\n}\n`
    }

    return `{\n${parts[0]}\n}\n`
  }

  // Old format: single marker at bottom
  const markerNode = at(children, startIdx)

  if (startIdx === 0) {
    return `${settingsContent.slice(0, markerNode.offset).trimEnd()}\n}\n`
  }

  const previousNode = at(children, startIdx - 1)
  const prefix = settingsContent.slice(
    0,
    previousNode.offset + previousNode.length,
  )
  const separator = settingsContent.slice(
    previousNode.offset + previousNode.length,
    markerNode.offset,
  )

  return `${prefix}${removeFirstComma(separator).trimEnd()}\n}\n`
}
