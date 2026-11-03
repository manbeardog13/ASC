import {defineConfig} from 'vite';
import tailwind from '@tailwindcss/vite';
export default defineConfig({base:'./',plugins:[tailwind()],build:{outDir:'assets',emptyOutDir:true,cssCodeSplit:false,rollupOptions:{input:'src/main.tsx',output:{entryFileNames:'studio.js',chunkFileNames:'[name]-[hash].js',assetFileNames:a=>(a.name?.endsWith('.css')?'studio.css':'[name]-[hash][extname]')}}}});
