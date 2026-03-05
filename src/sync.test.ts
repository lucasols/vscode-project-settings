import { describe, it, expect } from 'vitest'
import { syncSettings } from './sync'

const MARKER_VALUE =
  '---- Managed by project-settings (do not edit below) ----'

describe('syncSettings', () => {
  it('creates settings from empty content', () => {
    const result = syncSettings('', JSON.stringify({ 'editor.tabSize': 2 }))
    expect(result).toBe(
      `{\n  "----": "${MARKER_VALUE}",\n  "editor.tabSize": 2\n}\n`,
    )
  })

  it('creates settings with marker only when project settings is empty', () => {
    const result = syncSettings('', '{}')
    expect(result).toBe(`{\n  "----": "${MARKER_VALUE}"\n}\n`)
  })

  it('appends marker to existing settings without marker', () => {
    const settings = '{\n  "editor.fontSize": 14\n}\n'
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        '  "editor.fontSize": 14,',
        '',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('replaces synced section when marker exists', () => {
    const settings = [
      '{',
      '  "editor.fontSize": 14,',
      '',
      `  "----": "${MARKER_VALUE}",`,
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
        '  "editor.fontSize": 14,',
        '',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2,',
        '  "editor.wordWrap": "on"',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('excludes user-overridden keys from synced section', () => {
    const settings = [
      '{',
      '  "editor.tabSize": 4,',
      '',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2',
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
        '  "editor.tabSize": 4,',
        '',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.wordWrap": "on"',
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
    // Should not have double commas
    expect(result).not.toContain(',,')
  })

  it('handles empty project settings with existing settings', () => {
    const settings = '{\n  "editor.fontSize": 14\n}\n'
    const result = syncSettings(settings, '{}')
    expect(result).toBe(
      [
        '{',
        '  "editor.fontSize": 14,',
        '',
        `  "----": "${MARKER_VALUE}"`,
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

  it('handles no user properties with marker', () => {
    const settings = [
      '{',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 4',
      '}',
      '',
    ].join('\n')
    const projectSettings = JSON.stringify({ 'editor.tabSize': 2 })
    const result = syncSettings(settings, projectSettings)
    expect(result).toBe(
      [
        '{',
        '',
        `  "----": "${MARKER_VALUE}",`,
        '  "editor.tabSize": 2',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('handles multiple user overrides', () => {
    const settings = [
      '{',
      '  "editor.tabSize": 4,',
      '  "editor.wordWrap": "off",',
      '',
      `  "----": "${MARKER_VALUE}",`,
      '  "editor.tabSize": 2,',
      '  "editor.wordWrap": "on",',
      '  "editor.fontSize": 14',
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
    expect(result).toContain('"editor.tabSize": 4,')
    expect(result).toContain('"editor.wordWrap": "off",')
    expect(result).toContain('"editor.fontSize": 14')
    expect(result).toContain('"editor.formatOnSave": true')
    // overridden keys should not appear in synced section
    const lines = result.split('\n')
    const markerLineIdx = lines.findIndex((l) => l.includes('"----"'))
    const syncedLines = lines.slice(markerLineIdx + 1)
    const syncedText = syncedLines.join('\n')
    expect(syncedText).not.toContain('"editor.tabSize"')
    expect(syncedText).not.toContain('"editor.wordWrap"')
  })
})
