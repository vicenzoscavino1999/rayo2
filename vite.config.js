import { defineConfig } from 'vite';

export default defineConfig({
    // Root directory is where index.html is
    root: '.',

    // Build output
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },

    // Dev server
    server: {
        port: 3000,
        open: true
    },

    // Environment variables prefix (VITE_ variables are exposed to client)
    envPrefix: 'VITE_'
});
