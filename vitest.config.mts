import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Ten sam alias co w tsconfig.json: @/... → src/...
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Stała strefa czasowa, żeby asercje na formatowaniu dat nie zależały
    // od maszyny (lokalnie vs. CI).
    env: { TZ: 'Europe/Warsaw' },
  },
});
