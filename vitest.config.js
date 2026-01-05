/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        environment: 'happy-dom', // Simulates browser DOM for sanitizeHTML
        globals: true, // Allows using describe, it, expect without imports
        setupFiles: [], // Add setup files here if needed later
        include: ['tests/**/*.{test,spec}.js'],
    },
});
