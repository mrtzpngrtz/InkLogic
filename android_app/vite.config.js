import { defineConfig } from 'vite';

// Plugin to handle .nproj files
const nprojPlugin = () => {
  return {
    name: 'vite-plugin-nproj',
    transform(code, id) {
      if (id.endsWith('.nproj')) {
        // Return the file path as a string export
        return {
          code: `export default ${JSON.stringify(id)};`,
          map: null
        };
      }
    }
  };
};

export default defineConfig({
  plugins: [nprojPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/]
    }
  },
  server: {
    port: 3000
  },
  optimizeDeps: {
    exclude: ['web_pen_sdk']
  },
  resolve: {
    alias: {
      // Polyfills for Node.js modules
      zlib: 'browserify-zlib',
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      assert: 'assert'
    }
  },
  define: {
    'global': 'globalThis'
  }
});
