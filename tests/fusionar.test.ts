import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerHoja, type Fila } from '../src/importador/leerHoja'
import { parsearFilasKutxabank, type ExtractoLeido } from '../src/importador/kutxabank'
import { aplicarImportacion, preverImportacion } from '../src/importador/fusionar'
import type { Movimiento } from '../src/estado/tipos'

let extracto: ExtractoLeido

beforeAll(async () => {
  const b = readFileSync(new URL('./fixtures/extracto-ejemplo.xls', import.meta.url))
  extracto = parsearFilasKutxabank(
    await leerHoja(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'x.xls'),
  )
})

function importar(e: ExtractoLeido, existentes: Movimiento[], id = 'imp') {
  const prevision = preverImportacion(e, existentes)
  const r = aplicarImportacion(prevision, existentes, {
    importacionId: id,
    nombreArchivo: 'x.xls',
    fecha: '2026-03-10',
  })
  return { prevision, ...r }
}

/** Sub-extracto con las filas indicadas (índices del fixture). */
function subExtracto(indices: number[]): ExtractoLeido {
  const movimientos = indices.map((i) => extracto.movimientos[i]!)
  return {
    movimientos,
    saldoInicial: movimientos[0]!.saldo - movimientos[0]!.importe,
    saldoFinal: movimientos[movimientos.length - 1]!.saldo,
    periodoDesde: movimientos[0]!.fecha,
    periodoHasta: movimientos[movimientos.length - 1]!.fecha,
  }
}

describe('duplicados (§8.5)', () => {
  it('primera importación: todo nuevo, con ids únicos', () => {
    const { prevision, movimientos, importacion } = importar(extracto, [])
    expect(prevision.nuevos).toBe(24)
    expect(prevision.duplicados).toBe(0)
    expect(new Set(movimientos.map((m) => m.id)).size).toBe(24)
    expect(importacion).toMatchObject({ filasLeidas: 24, filasNuevas: 24, saldoInicial: 15000, saldoFinal: 40923 })
  })

  it('las tres compras de tren del 07/03 son tres movimientos distintos', () => {
    const { movimientos } = importar(extracto, [])
    const tren = movimientos.filter((m) => m.concepto === 'COMPRA T.C. TREN CERCANIAS TNA 05')
    expect(tren).toHaveLength(3)
    // Las dos de saldo 431,79 comparten clave: se distinguen por el número de aparición.
    expect(tren.map((m) => m.id.split('#')[1])).toEqual(['1', '2', '1'])
  })

  it('importar el mismo archivo dos veces → 0 nuevos', () => {
    const primera = importar(extracto, [])
    const segunda = importar(extracto, primera.movimientos, 'imp2')
    expect(segunda.prevision.nuevos).toBe(0)
    expect(segunda.prevision.duplicados).toBe(24)
    expect(segunda.movimientos).toHaveLength(24)
  })

  it('archivo solapado: solo entran los que faltan', () => {
    const primera = importar(subExtracto([...Array(12).keys()]), []) // filas 0–11
    const segunda = importar(extracto, primera.movimientos, 'imp2')
    expect(segunda.prevision.nuevos).toBe(12)
    expect(segunda.movimientos).toHaveLength(24)
    // Orden cronológico conservado y saldos encadenados.
    const m = segunda.movimientos
    for (let i = 1; i < m.length; i++) expect(m[i - 1]!.saldo + m[i]!.importe).toBe(m[i]!.saldo)
  })

  it('una compra repetida que ya estaba una vez: entra solo la segunda', () => {
    // Filas 16 y 18: compras de tren idénticas (mismo saldo 431,79).
    const conUna = importar(subExtracto([16]), [])
    const prevision = preverImportacion(subExtracto([16, 17, 18]), conUna.movimientos)
    expect(prevision.filas.map((f) => f.duplicado)).toEqual([true, false, false])
  })
})

describe('continuidad de saldo (§8.4)', () => {
  it('sin aviso si el extracto continúa al anterior (cortando entre días)', () => {
    const primera = importar(subExtracto([0, 1, 2]), []) // 02/03 completo
    const p = preverImportacion(subExtracto([3, 4, 5, 6, 7, 8]), primera.movimientos) // 03/03 completo
    expect(p.avisoContinuidad).toBeNull()
  })

  it('avisa si falta un periodo intermedio', () => {
    const primera = importar(subExtracto([0, 1, 2]), []) // hasta el 02/03
    const p = preverImportacion(subExtracto([20, 21, 22]), primera.movimientos) // desde el 08/03
    expect(p.avisoContinuidad).toMatch(/no encaja/)
  })
})

describe('categoría provisional', () => {
  it('Bizum y transferencias según el signo; devoluciones; resto a Otros', () => {
    const { movimientos } = importar(extracto, [])
    const cat = (c: string) => movimientos.find((m) => m.concepto === c)!.categoriaId
    expect(cat('ENVIO BIZUM Lucia')).toBe('bizum-recibido')
    expect(cat('ENVIO BIZUM cena viernes')).toBe('bizum-enviado')
    expect(cat('OP.NET pepe')).toBe('transferencias-recibidas')
    expect(cat('TRANSF. 0000')).toBe('transferencias-enviadas')
    expect(cat('DEVOLUCION T.P.V. TREN CERCANIAS TNA 05')).toBe('devoluciones')
    expect(cat('COMPRA T.C. PANADERIA EL TRIGO')).toBe('otros-gastos')
    expect(movimientos.every((m) => !m.categoriaManual)).toBe(true)
  })
})

describe('no guarda datos del titular', () => {
  it('el resultado solo contiene los campos del movimiento', () => {
    const filas: Fila[] = [
      ['TITULAR DE PRUEBA'],
      ['CALLE INVENTADA, 1'],
      ['fecha', 'concepto', 'fecha valor', 'importe', 'saldo'],
      ['01/01/2026', 'COMPRA T.C. X', '01/01/2026', -1, 99],
    ]
    const texto = JSON.stringify(parsearFilasKutxabank(filas))
    expect(texto).not.toContain('TITULAR')
    expect(texto).not.toContain('CALLE')
  })
})
