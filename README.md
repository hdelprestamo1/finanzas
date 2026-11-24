# Finanzas

App personal (PWA) para controlar ingresos, gastos y deudas a partir de los extractos de Kutxabank.
Todo se ejecuta en el dispositivo: sin servidor, sin red y con los datos cifrados. Ver [ESPECIFICACION.md](ESPECIFICACION.md).

> ⚠️ Este repositorio es público. **Nunca** se suben extractos, contactos ni copias (`.pdf`, `.vcf`, `.finanzas`, `datos-reales/`…). Antes de cada commit, revisa `git status`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Descarga las librerías a `node_modules/` (solo la primera vez o al cambiar dependencias). |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173/finanzas/ (sin CSP ni service worker). |
| `npm run build` | Comprueba los tipos y genera la app final en `dist/`. |
| `npm run preview` | Sirve `dist/` en http://localhost:4173/finanzas/ tal como quedará publicada (con CSP y service worker). |
| `npm test` | Ejecuta los tests (Vitest). |
| `npm run iconos` | Regenera los iconos de `public/`. |

## Despliegue

Cada `git push` a la rama `main` lanza `.github/workflows/desplegar.yml`, que ejecuta los tests, compila y publica en
`https://<usuario>.github.io/finanzas/`.
