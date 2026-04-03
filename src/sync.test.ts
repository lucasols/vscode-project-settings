import { describe, it, expect } from 'vitest'
import { removeSyncedSettings, syncSettings } from './sync'

const MARKER_VALUE = '---- Managed by project-settings ----'
const MARKER_END_VALUE = '---- End of managed settings ----'

describe('syncSettings', () => {
  it('creates settings from empty content', () => {
    const result = syncSettings('', JSON.stringify({ 'editor.tabSize': 2 }))
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        `  "----end": "${MARKER_END_VALUE}"`,
        '}',
        '',
      ].join('\n'),
    )
  })

  it('creates settings with markers only when project settings is empty', () => {
    const result = syncSettings('', '{}')
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        `  "----end": "${MARKER_END_VALUE}"`,
        '}',
        '',
      ].join('\n'),
    )
  })

  it('prepends markers to existing settings without markers', () => {
    const settings = '{\n  "editor.fontSize": 14\n}\n'
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        `  "----end": "${MARKER_END_VALUE}",`,
        '',
        '  "editor.fontSize": 14',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('replaces synced section when markers exist', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 4,',
      `  "----end": "${MARKER_END_VALUE}",`,
      '',
      '  "editor.fontSize": 14',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({
      'editor.tabSize': 2,
      'editor.wordWrap': 'on',
    })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        '  "editor.wordWrap": "on",',
        `  "----end": "${MARKER_END_VALUE}",`,
        '',
        '  "editor.fontSize": 14',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('excludes user-overridden keys from synced section', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      `  "----end": "${MARKER_END_VALUE}",`,
      '',
      '  "editor.tabSize": 4',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({
      'editor.tabSize': 2,
      'editor.wordWrap': 'on',
    })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.wordWrap": "on",',
        `  "----end": "${MARKER_END_VALUE}",`,
        '',
        '  "editor.tabSize": 4',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('preserves comments in user section', () => {
    const settings = [
      '{',
      '  // My custom font size',
      '  "editor.fontSize": 14',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toContain('// My custom font size')
    expect(result).toContain('"editor.fontSize": 14')
    expect(result).toContain('"editor.tabSize": 2')
  })

  it('handles trailing commas in existing settings', () => {
    const settings = '{\n  "editor.fontSize": 14,\n}\n'
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toContain('"editor.fontSize": 14,')
    expect(result).toContain('"editor.tabSize": 2')
    expect(result).not.toContain(',,')
  })

  it('handles empty project settings with existing settings', () => {
    const settings = '{\n  "editor.fontSize": 14\n}\n'
    const result = syncSettings(settings, '{}')
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        `  "----end": "${MARKER_END_VALUE}",`,
        '',
        '  "editor.fontSize": 14',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('is idempotent', () => {
    const projectSettings = JSON.stringify({
      'editor.tabSize': 2,
      'editor.wordWrap': 'on',
    })
    const first = syncSettings(
      '{\n  "editor.fontSize": 14\n}\n',
      projectSettings,
    )
    const second = syncSettings(first, projectSettings)
    expect(second).toBe(first)
  })

  it('throws on invalid project-settings.json', () => {
    expect(() => syncSettings('', 'not json')).toThrow(
      'project-settings.json contains invalid JSON',
    )
  })

  it('throws when project-settings.json is not an object', () => {
    expect(() => syncSettings('', '[1, 2, 3]')).toThrow(
      'project-settings.json must be a JSON object',
    )
  })

  it('handles nested objects in project settings', () => {
    const projectSettings = JSON.stringify({
      'editor.codeActionsOnSave': {
        'source.fixAll': 'explicit',
      },
    })
    const result = syncSettings('', projectSettings)
    expect(result).toContain('"editor.codeActionsOnSave": {')
    expect(result).toContain('"source.fixAll": "explicit"')
  })

  it('handles no user properties with markers', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 4,',
      `  "----end": "${MARKER_END_VALUE}"`,
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        `  "----end": "${MARKER_END_VALUE}"`,
        '}',
        '',
      ].join('\n'),
    )
  })

  it('handles multiple user overrides', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2,',
      '  "editor.wordWrap": "on",',
      '  "editor.fontSize": 14,',
      `  "----end": "${MARKER_END_VALUE}",`,
      '',
      '  "editor.tabSize": 4,',
      '  "editor.wordWrap": "off"',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({
      'editor.tabSize': 2,
      'editor.wordWrap': 'on',
      'editor.fontSize': 14,
      'editor.formatOnSave': true,
    })
    const result = syncSettings(settings, projectSettings)
    // User overrides should appear in user section
    expect(result).toContain('"editor.tabSize": 4,')
    expect(result).toContain('"editor.wordWrap": "off"')
    // Non-overridden synced settings should appear in synced section
    expect(result).toContain('"editor.fontSize": 14')
    expect(result).toContain('"editor.formatOnSave": true')
    // overridden keys should not appear in synced section (between markers)
    const lines = result.split('\n')
    const startMarkerIdx = lines.findIndex((l) => l.includes('"----"'))
    const endMarkerIdx = lines.findIndex((l) => l.includes('"----end"'))
    const syncedLines = lines.slice(startMarkerIdx + 1, endMarkerIdx)
    const syncedText = syncedLines.join('\n')
    expect(syncedText).not.toContain('"editor.tabSize"')
    expect(syncedText).not.toContain('"editor.wordWrap"')
  })

  it('migrates from old format (single marker at bottom)', () => {
    const settings = [
      '{',
      '  "editor.fontSize": 14,',
      '',
      '  "----": "---- Managed by project-settings (do not edit below) ----",',
      '  "editor.tabSize": 4',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({
      'editor.tabSize': 2,
    })
    const result = syncSettings(settings, projectSettings)
    // Should be in new format with markers at top
    expect(result).toBe(
      [
        '{',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        `  "----end": "${MARKER_END_VALUE}",`,
        '',
        '  "editor.fontSize": 14,',
        '}',
        '',
      ].join('\n'),
    )
  })
})

describe('removeSyncedSettings', () => {
  it('returns the original content when no marker exists', () => {
    const settings = '{\n  "editor.fontSize": 14\n}\n'
    expect(removeSyncedSettings(settings)).toBe(settings)
  })

  it('removes the managed section and preserves user settings', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2,',
      `  "----end": "${MARKER_END_VALUE}",`,
      '',
      '  "editor.fontSize": 14',
      '}',
      '',
    ].join('\n')

    expect(removeSyncedSettings(settings)).toBe(
      ['{', '  "editor.fontSize": 14', '}', ''].join('\n'),
    )
  })

  it('removes the managed section when it is the only content', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2,',
      `  "----end": "${MARKER_END_VALUE}"`,
      '}',
      '',
    ].join('\n')

    expect(removeSyncedSettings(settings)).toBe(['{', '}', ''].join('\n'))
  })

  it('preserves comments in user section', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2,',
      `  "----end": "${MARKER_END_VALUE}",`,
      '',
      '  "editor.fontSize": 14,',
      '  // keep this comment',
      '}',
      '',
    ].join('\n')

    expect(removeSyncedSettings(settings)).toBe(
      ['{', '  "editor.fontSize": 14,', '  // keep this comment', '}', ''].join(
        '\n',
      ),
    )
  })

  it('handles old format removal (single marker at bottom)', () => {
    const settings = [
      '{',
      '  "editor.fontSize": 14,',
      '',
      '  "----": "---- Managed by project-settings (do not edit below) ----",',
      '  "editor.tabSize": 2',
      '}',
      '',
    ].join('\n')

    expect(removeSyncedSettings(settings)).toBe(
      ['{', '  "editor.fontSize": 14', '}', ''].join('\n'),
    )
  })
})
