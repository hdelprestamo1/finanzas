// Categorías por defecto (§9.1, más «Deporte» para gimnasios).
import type { Categoria, TipoMovimiento } from '../estado/tipos'

export const CAT = {
  supermercado: 'supermercado',
  comidaFuera: 'comida-fuera',
  ocio: 'ocio',
  transporte: 'transporte',
  viajes: 'viajes',
  gasolina: 'gasolina',
  suscripciones: 'suscripciones',
  ropa: 'ropa',
  salud: 'salud',
  deporte: 'deporte',
  hogar: 'hogar',
  educacion: 'educacion',
  bizumEnviado: 'bizum-enviado',
  transferenciasEnviadas: 'transferencias-enviadas',
  otrosGastos: 'otros-gastos',
  nomina: 'nomina',
  bizumRecibido: 'bizum-recibido',
  transferenciasRecibidas: 'transferencias-recibidas',
  devoluciones: 'devoluciones',
  otrosIngresos: 'otros-ingresos',
} as const

const G = 'gasto' as const
const I = 'ingreso' as const

export function categoriasPorDefecto(): Categoria[] {
  const lista: [string, string, Categoria['tipo'], string][] = [
    [CAT.supermercado, 'Supermercado', G, '#2e9e5b'],
    [CAT.comidaFuera, 'Comida fuera', G, '#e07a2e'],
    [CAT.ocio, 'Ocio', G, '#b04fc7'],
    [CAT.transporte, 'Transporte', G, '#2f7fd1'],
    [CAT.viajes, 'Viajes', G, '#1aa3a3'],
    [CAT.gasolina, 'Gasolina', G, '#8a6d3b'],
    [CAT.suscripciones, 'Suscripciones', G, '#d14f7a'],
    [CAT.ropa, 'Ropa', G, '#c9a227'],
    [CAT.salud, 'Salud', G, '#d64545'],
    [CAT.deporte, 'Deporte', G, '#84cc16'],
    [CAT.hogar, 'Hogar', G, '#6b8e23'],
    [CAT.educacion, 'Educación', G, '#4b5bd6'],
    [CAT.bizumEnviado, 'Bizum enviado', G, '#0f8b8d'],
    [CAT.transferenciasEnviadas, 'Transferencias enviadas', G, '#5d6d7e'],
    [CAT.otrosGastos, 'Otros gastos', G, '#8a8f98'],
    [CAT.nomina, 'Nómina / trabajo', I, '#1f7a4d'],
    [CAT.bizumRecibido, 'Bizum recibido', I, '#14a37f'],
    [CAT.transferenciasRecibidas, 'Transferencias recibidas', I, '#3c8dbc'],
    [CAT.devoluciones, 'Devoluciones', I, '#7cb342'],
    [CAT.otrosIngresos, 'Otros ingresos', I, '#9aa1ab'],
  ]
  return lista.map(([id, nombre, tipo, color], orden) => ({ id, nombre, tipo, color, orden }))
}

/** Categoría provisional por tipo y signo (la fase 4 añade las reglas por comercio). */
export function categoriaBasica(tipo: TipoMovimiento, importe: number): string {
  const entra = importe > 0
  switch (tipo) {
    case 'bizum':
      return entra ? CAT.bizumRecibido : CAT.bizumEnviado
    case 'transferencia':
      return entra ? CAT.transferenciasRecibidas : CAT.transferenciasEnviadas
    case 'devolucion':
      return CAT.devoluciones
    default:
      return entra ? CAT.otrosIngresos : CAT.otrosGastos
  }
}
