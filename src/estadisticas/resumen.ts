// Cálculos de resumen para Inicio y Gráficas (§12). Funciones puras, en céntimos.
//
// Cómo cuenta cada movimiento, según el tipo de su categoría:
//   - categoría de gasto:   gasto  += −importe  (una devolución positiva RESTA gasto)
//   - categoría de ingreso: ingreso += importe
//   - "ambos" o sin categoría: por el signo.
// Así ingresos − gastos = suma de importes, y una compra devuelta no infla su categoría.

import type { Categoria, Movimiento } from '../estado/tipos'

export interface Totales {
  ingresos: number
  gastos: number
  balance: number
}

export interface TotalCategoria {
  categoriaId: string
  importe: number // gasto (positivo) o ingreso (positivo) neto de la categoría
}

export interface ResumenPeriodo extends Totales {
  gastosPorCategoria: TotalCategoria[] // de mayor a menor
  ingresosPorCategoria: TotalCategoria[]
  movimientos: number
}

function aporte(m: Movimiento, tipo: Categoria['tipo'] | undefined): { ingreso: number; gasto: number } {
  if (tipo === 'gasto') return { ingreso: 0, gasto: -m.importe }
  if (tipo === 'ingreso') return { ingreso: m.importe, gasto: 0 }
  return m.importe > 0 ? { ingreso: m.importe, gasto: 0 } : { ingreso: 0, gasto: -m.importe }
}

/** Resumen de los movimientos cuya fecha empieza por `prefijo` ("2026-03" = mes, "2026" = año). */
export function resumenPeriodo(
  movimientos: readonly Movimiento[],
  categorias: readonly Categoria[],
  prefijo: string,
): ResumenPeriodo {
  const tipos = new Map(categorias.map((c) => [c.id, c.tipo]))
  const gastoCat = new Map<string, number>()
  const ingresoCat = new Map<string, number>()
  let ingresos = 0
  let gastos = 0
  let n = 0
  for (const m of movimientos) {
    if (!m.fecha.startsWith(prefijo)) continue
    n++
    const { ingreso, gasto } = aporte(m, tipos.get(m.categoriaId))
    ingresos += ingreso
    gastos += gasto
    if (gasto) gastoCat.set(m.categoriaId, (gastoCat.get(m.categoriaId) ?? 0) + gasto)
    if (ingreso) ingresoCat.set(m.categoriaId, (ingresoCat.get(m.categoriaId) ?? 0) + ingreso)
  }
  const ordenar = (mapa: Map<string, number>) =>
    [...mapa.entries()]
      .filter(([, v]) => v > 0)
      .map(([categoriaId, importe]) => ({ categoriaId, importe }))
      .sort((a, b) => b.importe - a.importe)
  return {
    ingresos,
    gastos,
    balance: ingresos - gastos,
    gastosPorCategoria: ordenar(gastoCat),
    ingresosPorCategoria: ordenar(ingresoCat),
    movimientos: n,
  }
}

/** "aaaa-mm" de un movimiento o fecha ISO. */
export const mesDe = (fecha: string) => fecha.slice(0, 7)

/** Los `n` meses que acaban en `ultimo` (incluido), del más antiguo al más reciente. */
export function mesesHasta(ultimo: string, n: number): string[] {
  const [a, m] = ultimo.split('-').map(Number) as [number, number]
  const lista: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i
    lista.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`)
  }
  return lista
}

/** Mes anterior o siguiente ("2026-01", −1 → "2025-12"). */
export function desplazarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const total = a * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Mes que se muestra por defecto: el actual si tiene datos; si no, el último con datos. */
export function mesPorDefecto(movimientos: readonly Movimiento[], hoy: string): string {
  const actual = mesDe(hoy)
  if (movimientos.length === 0 || movimientos.some((m) => m.fecha.startsWith(actual))) return actual
  return mesDe(movimientos[movimientos.length - 1]!.fecha)
}

/** Ingresos y gastos por mes. */
export function serieMensual(
  movimientos: readonly Movimiento[],
  categorias: readonly Categoria[],
  meses: readonly string[],
): ({ mes: string } & Totales)[] {
  return meses.map((mes) => {
    const { ingresos, gastos, balance } = resumenPeriodo(movimientos, categorias, mes)
    return { mes, ingresos, gastos, balance }
  })
}

/** Saldo al final de cada día con movimientos (la lista está en orden cronológico). */
export function serieSaldo(movimientos: readonly Movimiento[]): { fecha: string; saldo: number }[] {
  const porDia = new Map<string, number>()
  for (const m of movimientos) porDia.set(m.fecha, m.saldo)
  return [...porDia.entries()].map(([fecha, saldo]) => ({ fecha, saldo }))
}

export function saldoActual(movimientos: readonly Movimiento[]): number | null {
  return movimientos.length ? movimientos[movimientos.length - 1]!.saldo : null
}

/** Años con movimientos, del más reciente al más antiguo. */
export function anios(movimientos: readonly Movimiento[]): string[] {
  return [...new Set(movimientos.map((m) => m.fecha.slice(0, 4)))].sort().reverse()
}
