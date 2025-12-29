import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Root directory is where index.html is
    root: '.',

    // Build output - multi-page app
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html'),
                messages: resolve(__dirname, 'messages.html'),
                terms: resolve(__dirname, 'terms.html'),
                privacy: resolve(__dirname, 'privacy.html')
            }
        }
    },

    // Dev server
    server: {
        port: 3000,
        open: true
    },

    // Environment variables prefix (VITE_ variables are exposed to client)
    envPrefix: 'VITE_'
});
