import { leerCentimos } from '../importador/kutxabank'

/** Importe escrito por el usuario ("12,50", "12.5", "1.234,56 €") → céntimos > 0, o null. */
export function leerImporteUsuario(texto: string): number | null {
  const c = leerCentimos(texto.trim())
  return c !== null && c > 0 ? c : null
}

/** Fecha local de hoy en formato aaaa-mm-dd. */
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
