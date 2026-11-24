// Filas del Excel de Kutxabank → movimientos (§8.2–8.4). Función pura y testeada.

import type { TipoMovimiento } from '../estado/tipos'
import { normalizar } from '../utilidades/texto'
import type { Celda, Fila } from './leerHoja'

/** Textos de Bizum que significan "sin texto" (§8.3). Ampliar aquí. */
export const TEXTOS_POR_DEFECTO = ['Envio de dinero con Bizum', 'Sin concepto']

const CABECERAS = ['FECHA', 'CONCEPTO', 'FECHA VALOR', 'IMPORTE', 'SALDO'] as const
const FILAS_BUSQUEDA_CABECERA = 30

export interface MovimientoLeido {
  fecha: string // aaaa-mm-dd
  fechaValor: string
  importe: number // céntimos
  saldo: number // céntimos
  concepto: string
  tipo: TipoMovimiento
  comercio?: string
  textoLibre?: string | null
  nombreEnConcepto?: string
  /** false si el prefijo no está en la tabla §8.3 (se marca en la vista previa). */
  reconocido: boolean
  /** Número de fila en la hoja (1 = primera fila), para mensajes de error. */
  fila: number
}

export interface ExtractoLeido {
  movimientos: MovimientoLeido[]
  saldoInicial: number
  saldoFinal: number
  periodoDesde: string
  periodoHasta: string
}

export class ErrorImportacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorImportacion'
  }
}

export function parsearFilasKutxabank(filas: Fila[]): ExtractoLeido {
  const cabecera = buscarCabecera(filas)
  if (!cabecera) {
    throw new ErrorImportacion(
      `Este archivo no parece un extracto de Kutxabank: no se encuentran las columnas fecha, concepto, fecha valor, importe y saldo (filas leídas: ${filas.length}).`,
    )
  }
  const { fila: filaCabecera, columnas } = cabecera

  const movimientos: MovimientoLeido[] = []
  for (let i = filaCabecera + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    if (filaVacia(fila, columnas)) {
      if (movimientos.length > 0) break // fin de los datos
      continue // filas vacías entre la cabecera y los datos
    }
    movimientos.push(leerMovimiento(fila, columnas, i + 1))
  }

  if (movimientos.length === 0) {
    throw new ErrorImportacion('El extracto no contiene movimientos.')
  }

  // Comprobación de saldo fila a fila (§8.4).
  for (let i = 1; i < movimientos.length; i++) {
    const anterior = movimientos[i - 1]!
    const actual = movimientos[i]!
    if (anterior.saldo + actual.importe !== actual.saldo) {
      throw new ErrorImportacion(
        `El saldo no cuadra en la fila ${actual.fila}: ${centimosATexto(anterior.saldo)} + ${centimosATexto(actual.importe)} debería dar ${centimosATexto(anterior.saldo + actual.importe)}, pero el extracto dice ${centimosATexto(actual.saldo)}. No se ha importado nada.`,
      )
    }
  }

  const primero = movimientos[0]!
  const ultimo = movimientos[movimientos.length - 1]!
  return {
    movimientos,
    saldoInicial: primero.saldo - primero.importe,
    saldoFinal: ultimo.saldo,
    periodoDesde: movimientos.reduce((m, x) => (x.fecha < m ? x.fecha : m), primero.fecha),
    periodoHasta: movimientos.reduce((m, x) => (x.fecha > m ? x.fecha : m), primero.fecha),
  }
}

// ---------------------------------------------------------------------------

type Columnas = Record<(typeof CABECERAS)[number], number>

function buscarCabecera(filas: Fila[]): { fila: number; columnas: Columnas } | null {
  const limite = Math.min(filas.length, FILAS_BUSQUEDA_CABECERA)
  for (let i = 0; i < limite; i++) {
    const textos = (filas[i] ?? []).map((c) => (typeof c === 'string' ? normalizar(c) : ''))
    const columnas = {} as Columnas
    let completas = true
    for (const nombre of CABECERAS) {
      const indice = textos.indexOf(nombre)
      if (indice < 0) {
        completas = false
        break
      }
      columnas[nombre] = indice
    }
    if (completas) return { fila: i, columnas }
  }
  return null
}

function filaVacia(fila: Fila, columnas: Columnas): boolean {
  return Object.values(columnas).every((c) => {
    const v = fila[c]
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
  })
}

function leerMovimiento(fila: Fila, columnas: Columnas, numeroFila: number): MovimientoLeido {
  const error = (campo: string, valor: Celda | undefined) =>
    new ErrorImportacion(
      `No se entiende ${campo} de la fila ${numeroFila} («${String(valor ?? '')}»). No se ha importado nada.`,
    )

  const fecha = leerFecha(fila[columnas.FECHA])
  if (!fecha) throw error('la fecha', fila[columnas.FECHA])
  const fechaValor = leerFecha(fila[columnas['FECHA VALOR']])
  if (!fechaValor) throw error('la fecha valor', fila[columnas['FECHA VALOR']])
  const importe = leerCentimos(fila[columnas.IMPORTE])
  if (importe === null) throw error('el importe', fila[columnas.IMPORTE])
  const saldo = leerCentimos(fila[columnas.SALDO])
  if (saldo === null) throw error('el saldo', fila[columnas.SALDO])
  const concepto = String(fila[columnas.CONCEPTO] ?? '').trim()

  return { fecha, fechaValor, importe, saldo, concepto, fila: numeroFila, ...clasificar(concepto, importe) }
}

/** `dd/mm/aaaa` (o `dd/mm/aa`) como texto; también número de serie de Excel por si se reguardó. */
export function leerFecha(valor: Celda | undefined): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) {
    // Serie de Excel: días desde 1899-12-30.
    const ms = Math.round(valor) * 86_400_000 + Date.UTC(1899, 11, 30)
    return new Date(ms).toISOString().slice(0, 10)
  }
  if (typeof valor !== 'string') return null
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(valor)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const anio = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null
  }
  return fecha.toISOString().slice(0, 10)
}

/** Número del Excel, o texto español (`-1.234,56`), a céntimos enteros. */
export function leerCentimos(valor: Celda | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : null
  if (typeof valor !== 'string') return null
  let texto = valor.replace(/[\s€ ]/g, '')
  if (!/^[+-]?[\d.,]+$/.test(texto)) return null
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.')
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '') // "1.234"
  const n = Number(texto)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

type Clasificacion = Pick<
  MovimientoLeido,
  'tipo' | 'comercio' | 'textoLibre' | 'nombreEnConcepto' | 'reconocido'
>

const TEXTOS_POR_DEFECTO_NORMALIZADOS = TEXTOS_POR_DEFECTO.map(normalizar)

/** Tipo de movimiento según el prefijo del concepto (§8.3). */
export function clasificar(concepto: string, importe: number): Clasificacion {
  const resto = (prefijo: string) => concepto.slice(prefijo.length).trim()
  const empieza = (prefijo: string) =>
    concepto.toUpperCase().startsWith(prefijo) || concepto.toUpperCase() === prefijo.trim()

  if (empieza('COMPRA T.C. ')) {
    return { tipo: 'tarjeta', comercio: resto('COMPRA T.C. '), reconocido: true }
  }
  if (empieza('DEVOLUCION T.P.V. ')) {
    return { tipo: 'devolucion', comercio: resto('DEVOLUCION T.P.V. '), reconocido: true }
  }
  if (empieza('ENVIO BIZUM ')) {
    const texto = resto('ENVIO BIZUM ')
    const deNombre = /^BIZUM DE\s+(.+)$/i.exec(texto)
    return {
      tipo: 'bizum',
      textoLibre: esTextoPorDefecto(texto) ? null : texto,
      ...(deNombre ? { nombreEnConcepto: normalizar(deNombre[1]!) } : {}),
      reconocido: true,
    }
  }
  if (empieza('TRANSF. ')) {
    // Enviada: el resto es el código del banco destino, sin texto útil.
    return { tipo: 'transferencia', textoLibre: null, reconocido: true }
  }
  if (empieza('OP.NET ')) {
    const texto = resto('OP.NET ')
    return { tipo: 'transferencia', textoLibre: texto || null, reconocido: true }
  }
  if (importe < 0) {
    // Compras sin prefijo: online, extranjero, suscripciones, viajes.
    return { tipo: 'tarjeta_diferida', comercio: concepto, reconocido: true }
  }
  return { tipo: 'otro', reconocido: false }
}

function esTextoPorDefecto(texto: string): boolean {
  return texto === '' || TEXTOS_POR_DEFECTO_NORMALIZADOS.includes(normalizar(texto))
}

function centimosATexto(c: number): string {
  const signo = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}
