// Puesta al día de los datos al desbloquear: cambios de versiones nuevas que deben
// aplicarse a datos guardados con versiones anteriores.
import type { EstadoApp } from './tipos'
import { categoriasPorDefecto, CAT } from '../categorias/porDefecto'
import { reclasificar } from '../categorias/clasificar'
import { ordenarPorCadena } from '../importador/orden'

/** Categorías añadidas después de la primera versión; se añaden UNA vez (si luego se borran, no vuelven). */
const CATEGORIAS_NUEVAS: { migracion: string; id: string; despuesDe: string }[] = [
  { migracion: 'categoria-deporte', id: CAT.deporte, despuesDe: CAT.salud },
]

export function actualizarDatos(estado: EstadoApp): { estado: EstadoApp; cambiado: boolean } {
  let e = estado
  let cambiado = false
  const hechas = new Set(e.migraciones ?? [])

  for (const nueva of CATEGORIAS_NUEVAS) {
    if (hechas.has(nueva.migracion)) continue
    hechas.add(nueva.migracion)
    cambiado = true
    if (e.categorias.some((c) => c.id === nueva.id)) continue
    const plantilla = categoriasPorDefecto().find((c) => c.id === nueva.id)!
    const ancla = e.categorias.find((c) => c.id === nueva.despuesDe)
    const orden = ancla ? ancla.orden + 0.5 : Math.max(0, ...e.categorias.map((c) => c.orden)) + 1
    e = { ...e, categorias: [...e.categorias, { ...plantilla, orden }] }
  }
  if (cambiado) e = { ...e, migraciones: [...hechas] }

  // Orden real dentro de cada día (cadena de saldos) y reglas por defecto actualizadas.
  const ordenados = ordenarPorCadena(e.movimientos)
  const clasificados = reclasificar(ordenados, e.reglas, e.categorias)
  if (clasificados.some((m, i) => m !== estado.movimientos[i]) || clasificados.length !== estado.movimientos.length) {
    e = { ...e, movimientos: clasificados }
    cambiado = true
  }
  return { estado: e, cambiado }
}
