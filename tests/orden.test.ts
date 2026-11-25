import { describe, expect, it } from 'vitest'
import type { Fila } from '../src/importador/leerHoja'
import { parsearFilasKutxabank } from '../src/importador/kutxabank'
import { aplicarImportacion, preverImportacion } from '../src/importador/fusionar'
import { ordenarPorCadena, roturas } from '../src/importador/orden'
import type { Movimiento } from '../src/estado/tipos'

// Datos INVENTADOS que reproducen un caso real: Kutxabank exportó un extracto corto
// (22/11–24/11) al que le faltaban dos movimientos del 22/11 que sí venían en uno largo.
const CAB: Fila = ['fecha', 'concepto', 'fecha valor', 'importe', 'saldo']
const A: Fila = ['21/11/2026', 'COMPRA T.C. TIENDA A', '21/11/2026', -3, 100]
const X1: Fila = ['22/11/2026', 'COMERCIO ONLINE 1', '20/11/2026', -20, 80]
const X2: Fila = ['22/11/2026', 'COMERCIO ONLINE 2', '20/11/2026', -5, 75]
const X3: Fila = ['22/11/2026', 'COMERCIO ONLINE 3', '20/11/2026', -7, 68]
const B: Fila = ['22/11/2026', 'COMPRA T.C. TIENDA B', '22/11/2026', -10, 58]
const C: Fila = ['23/11/2026', 'ENVIO BIZUM Lucia', '23/11/2026', 20, 78]

const extracto = (...filas: Fila[]) => parsearFilasKutxabank([CAB, ...filas])
const CORTO = extracto(X3, B, C) // le faltan X1 y X2 del 22/11
const LARGO = extracto(A, X1, X2, X3, B, C)

function importar(e: ReturnType<typeof extracto>, existentes: Movimiento[]) {
  const prevision = preverImportacion(e, existentes)
  const { movimientos } = aplicarImportacion(prevision, existentes, {
    importacionId: 'i',
    nombreArchivo: 'x.xls',
    fecha: '',
  })
  return { prevision, movimientos }
}

const conceptos = (ms: Movimiento[]) => ms.map((m) => m.concepto.split(' ').pop())

describe('fusión ordenada por la cadena de saldos', () => {
  it('corto y luego largo: los movimientos que faltaban quedan en su sitio', () => {
    const primero = importar(CORTO, [])
    const segundo = importar(LARGO, primero.movimientos)
    expect(segundo.prevision.nuevos).toBe(3)
    expect(segundo.prevision.avisoContinuidad).toBeNull()
    expect(conceptos(segundo.movimientos)).toEqual(['A', '1', '2', '3', 'B', 'Lucia'])
    expect(roturas(segundo.movimientos)).toEqual([])
  })

  it('volver a importar el corto: 0 nuevos y SIN aviso (era el fallo)', () => {
    const datos = importar(LARGO, importar(CORTO, []).movimientos).movimientos
    const otraVez = importar(CORTO, datos)
    expect(otraVez.prevision.nuevos).toBe(0)
    expect(otraVez.prevision.avisoContinuidad).toBeNull()
  })

  it('largo y luego corto: nada nuevo y sin aviso', () => {
    const datos = importar(LARGO, []).movimientos
    const r = importar(CORTO, datos)
    expect(r.prevision.nuevos).toBe(0)
    expect(r.prevision.avisoContinuidad).toBeNull()
  })

  it('un hueco de verdad sí se avisa', () => {
    // Guardado: hasta el 21/11 (saldo 100). Nuevo: desde X3 (parte de 75): faltan X1 y X2.
    const datos = importar(extracto(A), []).movimientos
    const r = importar(CORTO, datos)
    expect(r.prevision.nuevos).toBe(3)
    expect(r.prevision.avisoContinuidad).toMatch(/no encaja entre el 21\/11\/2026 y el 22\/11\/2026/)
    expect(r.prevision.avisoContinuidad).toMatch(/diferencia -25,00/)
  })
})

describe('ordenarPorCadena', () => {
  const m = (fecha: string, importe: number, saldo: number, n: string) => ({ fecha, importe, saldo, n })

  it('reordena un día desordenado siguiendo los saldos', () => {
    const lista = [
      m('2026-11-21', -300, 10000, 'a'),
      m('2026-11-22', -1000, 5800, 'b'), // venía antes de tiempo
      m('2026-11-22', -2000, 8000, 'x1'),
      m('2026-11-22', -500, 7500, 'x2'),
      m('2026-11-22', -700, 6800, 'x3'),
    ]
    expect(ordenarPorCadena(lista).map((x) => x.n)).toEqual(['a', 'x1', 'x2', 'x3', 'b'])
  })

  it('movimientos idénticos el mismo día (compra, devolución, compra)', () => {
    const lista = [
      m('2026-03-07', -310, 43179, 'compra2'),
      m('2026-03-07', 310, 43489, 'devolucion'),
      m('2026-03-07', -310, 43179, 'compra1'),
      m('2026-03-07', -310, 42869, 'compra3'),
    ]
    const r = ordenarPorCadena(lista)
    expect(roturas(r)).toEqual([])
    expect(r.map((x) => x.n)).toEqual(['compra2', 'devolucion', 'compra1', 'compra3'])
  })

  it('si un día no se puede encadenar, conserva el orden que traía', () => {
    const lista = [m('2026-01-01', -100, 900, 'p'), m('2026-01-01', -100, 500, 'q')]
    expect(ordenarPorCadena(lista).map((x) => x.n)).toEqual(['p', 'q'])
  })

  it('ordena por fecha aunque lleguen mezcladas', () => {
    const lista = [m('2026-01-02', 100, 200, 'd2'), m('2026-01-01', 100, 100, 'd1')]
    expect(ordenarPorCadena(lista).map((x) => x.n)).toEqual(['d1', 'd2'])
  })
})
