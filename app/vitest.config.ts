import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Runs the posting engine and write helpers against a real SQLite database
 * (node:sqlite) using the generated PowerSync schema, without React Native.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: '@domain', replacement: path.resolve(__dirname, '../packages/domain/src/index.ts') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src') + '/$1' },
      { find: '@powersync/react-native', replacement: path.resolve(__dirname, 'test/powersync-shim.ts') },
    ],
  },
});
