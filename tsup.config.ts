import { defineConfig } from 'tsup';

export default defineConfig([
  // 库入口：生成 JS + DTS
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    esbuildOptions(options) {
      options.loader = { ...options.loader, '.kb.json': 'json' };
    },
  },
  // CLI入口：只生成JS，不生成DTS（避免Node类型污染库DTS）
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
    esbuildOptions(options) {
      options.loader = { ...options.loader, '.kb.json': 'json' };
      options.define = { 'process.env.NODE_ENV': '"production"' };
    },
  },
]);