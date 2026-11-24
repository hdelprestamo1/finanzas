// Formato de importes y fechas para mostrar (en español).
import type { TipoMovimiento } from '../estado/tipos'

const formatoEuros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
})

/** 123456 → "1.234,56 €" */
export function euros(centimos: number): string {
  return formatoEuros.format(centimos / 100)
}

/** 123456 → "+1.234,56 €" (con signo también en positivos) */
export function eurosConSigno(centimos: number): string {
  return (centimos > 0 ? '+' : '') + euros(centimos)
}

/** "2026-03-02" → "02/03/2026" */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "2026-03" → "marzo 2026" */
export function nombreMes(aaaamm: string): string {
  const [a, m] = aaaamm.split('-')
  return `${MESES[Number(m) - 1]} ${a}`
}

/** "2026-03-02" → "lunes, 2 de marzo de 2026" */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
  return `${dia}, ${d} de ${MESES[m - 1]} de ${a}`
}

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  tarjeta: 'Tarjeta',
  tarjeta_diferida: 'Tarjeta (sin prefijo)',
  devolucion: 'Devolución',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  otro: 'Otro',
}
