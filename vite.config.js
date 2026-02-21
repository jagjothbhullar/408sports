import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  build: {
    outDir: 'dist',
  },
  // Ensure data directory is accessible in dev and copied to dist
  server: {
    fs: {
      allow: ['.'],
    },
  },
});
