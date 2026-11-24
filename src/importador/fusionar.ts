// Duplicados (§8.5), continuidad de saldo (§8.4) y alta de movimientos nuevos.

import type { Importacion, Movimiento } from '../estado/tipos'
import { categoriaBasica } from '../categorias/porDefecto'
import { normalizar } from '../utilidades/texto'
import { euros, fechaCorta } from '../utilidades/formato'
import type { ExtractoLeido, MovimientoLeido } from './kutxabank'

type ConClave = Pick<Movimiento, 'fecha' | 'fechaValor' | 'importe' | 'saldo' | 'concepto'>

/** Clave de un movimiento: fecha + fechaValor + importe + saldo + concepto normalizado. */
export function claveMovimiento(m: ConClave): string {
  return [m.fecha, m.fechaValor, m.importe, m.saldo, normalizar(m.concepto)].join('|')
}

export interface FilaPrevia {
  leido: MovimientoLeido
  /** id que tendrá el movimiento (clave#aparición). */
  id: string
  duplicado: boolean
}

export interface PrevisionImportacion {
  extracto: ExtractoLeido
  filas: FilaPrevia[]
  nuevos: number
  duplicados: number
  /** Aviso si el saldo inicial no encaja con lo ya importado (puede faltar un periodo). */
  avisoContinuidad: string | null
}

/**
 * Para cada clave: si en la base hay k movimientos y en el archivo n, solo
 * son nuevos los que aparecen en la posición k+1..n del archivo.
 */
export function preverImportacion(
  extracto: ExtractoLeido,
  existentes: readonly Movimiento[],
): PrevisionImportacion {
  const enBase = new Map<string, number>()
  for (const m of existentes) {
    const clave = claveMovimiento(m)
    enBase.set(clave, (enBase.get(clave) ?? 0) + 1)
  }

  const vistos = new Map<string, number>()
  const filas = extracto.movimientos.map((leido) => {
    const clave = claveMovimiento(leido)
    const aparicion = (vistos.get(clave) ?? 0) + 1
    vistos.set(clave, aparicion)
    return { leido, id: `${clave}#${aparicion}`, duplicado: aparicion <= (enBase.get(clave) ?? 0) }
  })

  const nuevos = filas.filter((f) => !f.duplicado).length
  return {
    extracto,
    filas,
    nuevos,
    duplicados: filas.length - nuevos,
    avisoContinuidad: comprobarContinuidad(extracto, existentes),
  }
}

function comprobarContinuidad(extracto: ExtractoLeido, existentes: readonly Movimiento[]): string | null {
  // Último movimiento ya guardado anterior al inicio del extracto (la lista está en orden cronológico).
  let anterior: Movimiento | undefined
  for (const m of existentes) if (m.fecha < extracto.periodoDesde) anterior = m
  if (!anterior || anterior.saldo === extracto.saldoInicial) return null
  return `El saldo inicial de este extracto (${euros(extracto.saldoInicial)}) no coincide con el saldo tras el último movimiento ya importado antes del ${fechaCorta(extracto.periodoDesde)} (${euros(anterior.saldo)}). Puede faltar algún periodo intermedio.`
}

/** Aplica la importación: devuelve la lista completa de movimientos y el registro de importación. */
export function aplicarImportacion(
  prevision: PrevisionImportacion,
  existentes: readonly Movimiento[],
  datos: { importacionId: string; nombreArchivo: string; fecha: string },
): { movimientos: Movimiento[]; importacion: Importacion } {
  const nuevos: Movimiento[] = prevision.filas
    .filter((f) => !f.duplicado)
    .map(({ leido, id }) => {
      const m: Movimiento = {
        id,
        fecha: leido.fecha,
        fechaValor: leido.fechaValor,
        importe: leido.importe,
        saldo: leido.saldo,
        concepto: leido.concepto,
        tipo: leido.tipo,
        categoriaId: categoriaBasica(leido.tipo, leido.importe),
        categoriaManual: false,
        importacionId: datos.importacionId,
      }
      if (leido.comercio !== undefined) m.comercio = leido.comercio
      if (leido.textoLibre !== undefined) m.textoLibre = leido.textoLibre
      if (leido.nombreEnConcepto !== undefined) m.nombreEnConcepto = leido.nombreEnConcepto
      return m
    })

  // Orden cronológico estable: a igual fecha, primero lo que ya había y luego el orden del archivo.
  const movimientos = [...existentes, ...nuevos]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.fecha < b.m.fecha ? -1 : a.m.fecha > b.m.fecha ? 1 : a.i - b.i))
    .map(({ m }) => m)

  const { extracto } = prevision
  return {
    movimientos,
    importacion: {
      id: datos.importacionId,
      fecha: datos.fecha,
      nombreArchivo: datos.nombreArchivo,
      periodoDesde: extracto.periodoDesde,
      periodoHasta: extracto.periodoHasta,
      saldoInicial: extracto.saldoInicial,
      saldoFinal: extracto.saldoFinal,
      filasLeidas: prevision.filas.length,
      filasNuevas: prevision.nuevos,
      filasDuplicadas: prevision.duplicados,
    },
  }
}
