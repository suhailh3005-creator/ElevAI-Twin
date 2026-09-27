import { fieldLabPlugin } from './server/field-lab';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { manualAiPlugin } from './server/manual-ai';
export default defineConfig({ plugins: [react(), tailwindcss(), manualAiPlugin(), fieldLabPlugin()], base: './', server:{watch:{ignored:['**/.data/**','**/.field-browser-*/**']}}, cacheDir: 'node_modules/.vite-elevai-manual-v3' });


