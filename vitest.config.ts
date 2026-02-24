import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest Unit Test Configuration — Golden Years Club
 *
 * Tests utility functions and business logic without a browser.
 *
 * Usage:
 *   npx vitest            # watch mode
 *   npx vitest run        # single run (CI)
 */
export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.ts'],
        environment: 'node',
        globals: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
});
