// Duplicados (§8.5), continuidad de saldo (§8.4) y alta de movimientos nuevos.

import type { Importacion, Movimiento } from '../estado/tipos'
import { categoriaBasica } from '../categorias/porDefecto'
import { normalizar } from '../utilidades/texto'
import { euros, fechaCorta } from '../utilidades/formato'
import type { ExtractoLeido, MovimientoLeido } from './kutxabank'
import { ordenarPorCadena, roturas } from './orden'

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
  /** Aviso si algún movimiento nuevo no encaja con lo ya importado (puede faltar algo). */
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
  const prevision: PrevisionImportacion = {
    extracto,
    filas,
    nuevos,
    duplicados: filas.length - nuevos,
    avisoContinuidad: null,
  }
  prevision.avisoContinuidad = comprobarContinuidad(prevision, existentes)
  return prevision
}

/**
 * Continuidad de saldo (§8.4): se simula la fusión y se mira si algún movimiento NUEVO
 * no encaja con el que queda antes o después (saldo anterior + importe ≠ saldo).
 * Si no hay movimientos nuevos, no hay nada que avisar.
 */
function comprobarContinuidad(prevision: PrevisionImportacion, existentes: readonly Movimiento[]): string | null {
  if (prevision.nuevos === 0 || existentes.length === 0) return null
  const nuevos = crearMovimientos(prevision, '')
  const idsNuevos = new Set(nuevos.map((m) => m.id))
  const lista = ordenarPorCadena([...existentes, ...nuevos])
  const rota = roturas(lista).find((i) => idsNuevos.has(lista[i]!.id) || idsNuevos.has(lista[i - 1]!.id))
  if (rota === undefined) return null
  const antes = lista[rota - 1]!
  const despues = lista[rota]!
  const esperado = despues.saldo - despues.importe
  return `El saldo no encaja entre el ${fechaCorta(antes.fecha)} y el ${fechaCorta(despues.fecha)}: tras el primero el saldo es ${euros(antes.saldo)}, pero el siguiente parte de ${euros(esperado)} (diferencia ${euros(esperado - antes.saldo)}). Puede faltar algún movimiento intermedio.`
}

/** Movimientos que se darían de alta (los no duplicados), con su categoría provisional. */
function crearMovimientos(prevision: PrevisionImportacion, importacionId: string): Movimiento[] {
  return prevision.filas
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
        importacionId,
      }
      if (leido.comercio !== undefined) m.comercio = leido.comercio
      if (leido.textoLibre !== undefined) m.textoLibre = leido.textoLibre
      if (leido.nombreEnConcepto !== undefined) m.nombreEnConcepto = leido.nombreEnConcepto
      return m
    })
}

/** Aplica la importación: devuelve la lista completa de movimientos y el registro de importación. */
export function aplicarImportacion(
  prevision: PrevisionImportacion,
  existentes: readonly Movimiento[],
  datos: { importacionId: string; nombreArchivo: string; fecha: string },
): { movimientos: Movimiento[]; importacion: Importacion } {
  // Orden por fecha y, dentro de cada día, por la cadena de saldos (el orden real del banco).
  const movimientos = ordenarPorCadena([...existentes, ...crearMovimientos(prevision, datos.importacionId)])

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
