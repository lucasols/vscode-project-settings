import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  clean: true,
  format: ['esm'],
  splitting: true,
  external: ['vscode'],
  noExternal: ['jsonc-parser'],
  sourcemap: true,
  esbuildOptions(options) {
    options.mangleProps = /[^_]_$/
  },
})
