// Genera los iconos de la app (PNG) sin dependencias: dibuja tres barras
// crecientes sobre fondo verde y codifica el PNG con zlib de Node.
// Uso: npm run iconos
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const FONDO = [0x1f, 0x6f, 0x5c]
const BARRA = [0xff, 0xff, 0xff]

// Barras en coordenadas relativas (0..1). Todo dentro de la "zona segura"
// central del 80 % para que el icono maskable no se recorte.
const BARRAS = [
  { x0: 0.27, x1: 0.39, y0: 0.55, y1: 0.73 },
  { x0: 0.44, x1: 0.56, y0: 0.42, y1: 0.73 },
  { x0: 0.61, x1: 0.73, y0: 0.27, y1: 0.73 },
]
const RADIO = 0.025

function dentroDeBarra(u, v) {
  for (const b of BARRAS) {
    if (u < b.x0 || u > b.x1 || v < b.y0 || v > b.y1) continue
    // Esquinas redondeadas
    const cx = Math.min(Math.max(u, b.x0 + RADIO), b.x1 - RADIO)
    const cy = Math.min(Math.max(v, b.y0 + RADIO), b.y1 - RADIO)
    if ((u - cx) ** 2 + (v - cy) ** 2 <= RADIO ** 2) return true
  }
  return false
}

function dibujar(tam) {
  const SS = 4 // supermuestreo para suavizar bordes
  const filas = Buffer.alloc((tam * 3 + 1) * tam)
  for (let y = 0; y < tam; y++) {
    const fila = y * (tam * 3 + 1)
    filas[fila] = 0 // filtro "None"
    for (let x = 0; x < tam; x++) {
      let dentro = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          if (dentroDeBarra((x + (sx + 0.5) / SS) / tam, (y + (sy + 0.5) / SS) / tam)) dentro++
      const a = dentro / (SS * SS)
      for (let c = 0; c < 3; c++)
        filas[fila + 1 + x * 3 + c] = Math.round(FONDO[c] * (1 - a) + BARRA[c] * a)
    }
  }
  return png(tam, tam, filas)
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloque(tipo, datos) {
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(datos.length, 0)
  cab.write(tipo, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), datos])))
  return Buffer.concat([cab, datos, crc])
}

function png(ancho, alto, filas) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ])
}

const destino = new URL('../public/', import.meta.url)
mkdirSync(destino, { recursive: true })
for (const tam of [180, 192, 512]) {
  writeFileSync(new URL(`icono-${tam}.png`, destino), dibujar(tam))
  console.log(`public/icono-${tam}.png`)
}
