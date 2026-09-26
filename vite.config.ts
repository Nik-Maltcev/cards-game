import { defineConfig, type Plugin } from 'vite';

const CG_SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v2.js"></script>';

function crazygamesSdkTag(): Plugin {
  return {
    name: 'crazygames-sdk-tag',
    transformIndexHtml: (html) => html.replace('</head>', `  ${CG_SDK_TAG}\n  </head>`),
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'crazygames' ? [crazygamesSdkTag()] : [],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
}));
