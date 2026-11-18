import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In production the UI and API share the CloudFront origin, so the app calls relative
// /v1 URLs. `pnpm dev` outside compose proxies them to the local gateway.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/v1': process.env.API_PROXY_TARGET ?? 'http://localhost:8080' },
  },
});
