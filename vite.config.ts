import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// Ruta de GitHub Pages: https://<usuario>.github.io/finanzas/
const BASE = '/finanzas/'

// Content-Security-Policy (§5.1). Se inyecta solo en el build: en modo desarrollo
// Vite mete los estilos con <style> en línea y la política los bloquearía.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // 'frame-ancestors' no se incluye: los navegadores la ignoran en <meta> (solo
  // funciona como cabecera HTTP, y GitHub Pages no permite definir cabeceras).
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'finanzas-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Evita el polyfill de modulepreload (no hace falta en navegadores actuales).
    modulePreload: { polyfill: false },
  },
  plugins: [
    preact(),
    cspPlugin(),
    VitePWA({
      // Actualizaciones solo bajo demanda (§6): el SW nuevo queda en espera.
      registerType: 'prompt',
      // Registramos el SW nosotros (sin script en línea, compatible con la CSP).
      injectRegister: false,
      includeAssets: ['icono-180.png', 'icono-192.png'],
      manifest: {
        name: 'Finanzas',
        short_name: 'Finanzas',
        description: 'Control personal de ingresos, gastos y deudas',
        lang: 'es',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1f6f5c',
        theme_color: '#1f6f5c',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo el código se precachea y se sirve siempre desde caché.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,mjs}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Sin caché en tiempo de ejecución de otros orígenes: no hay peticiones externas.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
