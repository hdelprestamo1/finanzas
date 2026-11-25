import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerHoja } from '../src/importador/leerHoja'
import { parsearFilasKutxabank } from '../src/importador/kutxabank'
import { preverImportacion } from '../src/importador/fusionar'
import { importarExtracto } from '../src/categorias/operaciones'
import { estadoInicial, type EstadoApp } from '../src/estado/tipos'
import {
  anios,
  desplazarMes,
  mesPorDefecto,
  mesesHasta,
  resumenPeriodo,
  saldoActual,
  serieMensual,
  serieSaldo,
} from '../src/estadisticas/resumen'

let estado: EstadoApp

beforeAll(async () => {
  const b = readFileSync(new URL('./fixtures/extracto-ejemplo.xls', import.meta.url))
  const extracto = parsearFilasKutxabank(
    await leerHoja(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'x.xls'),
  )
  estado = importarExtracto(estadoInicial(), preverImportacion(extracto, []), {
    importacionId: 'imp',
    nombreArchivo: 'x.xls',
    fecha: '2026-03-10',
  })
})

describe('resumenPeriodo', () => {
  it('ingresos − gastos = suma de importes = saldo final − saldo inicial', () => {
    const r = resumenPeriodo(estado.movimientos, estado.categorias, '2026-03')
    expect(r.balance).toBe(40923 - 15000)
    expect(r.movimientos).toBe(24)
  })

  it('una compra devuelta no infla el gasto de su categoría', () => {
    const r = resumenPeriodo(estado.movimientos, estado.categorias, '2026-03')
    // Transporte: movilidad 0,75 + 3 trenes de 3,10 − devolución 3,10 + taxi 8,20.
    const transporte = r.gastosPorCategoria.find((c) => c.categoriaId === 'transporte')!
    expect(transporte.importe).toBe(75 + 310 * 3 - 310 + 820)
    // La devolución no aparece como ingreso.
    expect(r.ingresosPorCategoria.some((c) => c.categoriaId === 'devoluciones')).toBe(false)
  })

  it('totales de ingresos y gastos del extracto de ejemplo', () => {
    const r = resumenPeriodo(estado.movimientos, estado.categorias, '2026')
    // Ingresos: Bizum recibidos 45+30+12,5+4+7+10,9+25 = 134,40 y OP.NET 300.
    expect(r.ingresos).toBe(13440 + 30000)
    expect(r.gastos).toBe(r.ingresos - r.balance)
    expect(r.gastosPorCategoria[0]!.importe).toBeGreaterThanOrEqual(r.gastosPorCategoria.at(-1)!.importe)
  })

  it('periodo sin movimientos', () => {
    expect(resumenPeriodo(estado.movimientos, estado.categorias, '2025-01')).toMatchObject({
      ingresos: 0,
      gastos: 0,
      balance: 0,
      movimientos: 0,
    })
  })
})

describe('meses', () => {
  it('mesesHasta cruza el cambio de año', () => {
    expect(mesesHasta('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(mesesHasta('2026-03', 12)).toHaveLength(12)
  })

  it('desplazarMes', () => {
    expect(desplazarMes('2026-01', -1)).toBe('2025-12')
    expect(desplazarMes('2025-12', 1)).toBe('2026-01')
    expect(desplazarMes('2026-03', 0)).toBe('2026-03')
  })

  it('mesPorDefecto: el actual si tiene datos; si no, el último con datos', () => {
    expect(mesPorDefecto(estado.movimientos, '2026-03-20')).toBe('2026-03')
    expect(mesPorDefecto(estado.movimientos, '2026-11-24')).toBe('2026-03')
    expect(mesPorDefecto([], '2026-11-24')).toBe('2026-11')
  })
})

describe('series', () => {
  it('serieMensual', () => {
    const s = serieMensual(estado.movimientos, estado.categorias, mesesHasta('2026-03', 3))
    expect(s.map((x) => x.mes)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(s[0]).toMatchObject({ ingresos: 0, gastos: 0 })
    expect(s[2]!.balance).toBe(25923)
  })

  it('serieSaldo: saldo al final de cada día', () => {
    const s = serieSaldo(estado.movimientos)
    expect(s[0]).toEqual({ fecha: '2026-03-02', saldo: 19185 })
    expect(s.at(-1)).toEqual({ fecha: '2026-03-09', saldo: 40923 })
    expect(s).toHaveLength(8)
  })

  it('saldo actual y años', () => {
    expect(saldoActual(estado.movimientos)).toBe(40923)
    expect(saldoActual([])).toBeNull()
    expect(anios(estado.movimientos)).toEqual(['2026'])
  })
})
