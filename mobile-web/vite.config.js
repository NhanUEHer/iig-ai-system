import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>({
  base:mode==='production'?'/events/':'/',
  plugins:[react()],
  server:{
    host:'0.0.0.0',
    port:5174,
    proxy:{
      '/api':{
        target:process.env.VITE_API_PROXY_TARGET||'http://127.0.0.1:5005',
        changeOrigin:true,
        secure:false,
      },
      '/question-bank-media':{
        target:process.env.VITE_API_PROXY_TARGET||'http://127.0.0.1:5005',
        changeOrigin:true,
        secure:false,
      },
    },
  },
}));
