// Clasificación automática de movimientos (§9.2).
//
// Orden:
//   1. Movimientos con categoriaManual: no se tocan nunca.
//   2. Reglas del usuario (la más reciente primero).
//   3. Devoluciones: misma categoría que la última compra del mismo comercio;
//      si no hay, "Devoluciones".
//   4. Bizum y transferencias: enviado/recibido según el signo.
//   5. Reglas por defecto (palabra clave en el comercio).
//   6. "Otros gastos" / "Otros ingresos".
// Una regla cuya categoría ya no existe se ignora.

import type { Categoria, Movimiento, ReglaCategoria } from '../estado/tipos'
import { normalizar, palabras } from '../utilidades/texto'
import { CAT, categoriaBasica } from './porDefecto'
import { PALABRAS_POR_CATEGORIA } from './reglasPorDefecto'

export const REGLAS_POR_DEFECTO: ReglaCategoria[] = Object.entries(PALABRAS_POR_CATEGORIA).flatMap(
  ([categoriaId, lista]) =>
    lista.map((contiene) => ({
      id: `defecto:${normalizar(contiene)}`,
      campo: 'comercio' as const,
      contiene: normalizar(contiene),
      categoriaId,
      creadaPorUsuario: false,
    })),
)

/** ¿Aparecen las palabras de `buscado`, seguidas y completas, dentro de `texto`? */
export function contienePalabras(texto: string, buscado: string): boolean {
  const t = palabras(texto)
  const b = palabras(buscado)
  if (b.length === 0 || b.length > t.length) return false
  for (let i = 0; i + b.length <= t.length; i++) {
    if (b.every((p, j) => t[i + j] === p)) return true
  }
  return false
}

function aplica(regla: ReglaCategoria, m: Movimiento): boolean {
  const texto = regla.campo === 'comercio' ? m.comercio : m.concepto
  return texto !== undefined && contienePalabras(texto, regla.contiene)
}

/**
 * Reclasifica todos los movimientos no editados a mano. Devuelve una lista nueva
 * (los objetos que no cambian se reutilizan). La lista debe estar en orden cronológico.
 */
export function reclasificar(
  movimientos: readonly Movimiento[],
  reglasUsuario: readonly ReglaCategoria[],
  categorias: readonly Categoria[],
): Movimiento[] {
  const existe = new Set(categorias.map((c) => c.id))
  const valida = (r: ReglaCategoria) => existe.has(r.categoriaId)
  const usuario = [...reglasUsuario].reverse().filter(valida) // la más reciente primero
  const defecto = REGLAS_POR_DEFECTO.filter(valida)
  const ultimaCompra = new Map<string, string>() // comercio normalizado → categoría

  return movimientos.map((m) => {
    let categoriaId = m.categoriaId
    if (!m.categoriaManual) {
      categoriaId = calcular(m, usuario, defecto, ultimaCompra)
      if (!existe.has(categoriaId)) categoriaId = m.importe > 0 ? CAT.otrosIngresos : CAT.otrosGastos
    }
    if ((m.tipo === 'tarjeta' || m.tipo === 'tarjeta_diferida') && m.importe < 0 && m.comercio) {
      ultimaCompra.set(normalizar(m.comercio), categoriaId)
    }
    return categoriaId === m.categoriaId ? m : { ...m, categoriaId }
  })
}

function calcular(
  m: Movimiento,
  usuario: ReglaCategoria[],
  defecto: ReglaCategoria[],
  ultimaCompra: Map<string, string>,
): string {
  const deUsuario = usuario.find((r) => aplica(r, m))
  if (deUsuario) return deUsuario.categoriaId

  if (m.tipo === 'devolucion') {
    return (m.comercio && ultimaCompra.get(normalizar(m.comercio))) || CAT.devoluciones
  }
  if (m.tipo === 'bizum' || m.tipo === 'transferencia') return categoriaBasica(m.tipo, m.importe)

  const porDefecto = defecto.find((r) => aplica(r, m))
  if (porDefecto) return porDefecto.categoriaId

  return categoriaBasica(m.tipo, m.importe)
}

/**
 * Texto propuesto para una regla a partir de un comercio: sin códigos finales
 * con cifras ("SUPER EJEMPLO 5350" → "SUPER EJEMPLO"). El usuario puede editarlo.
 */
export function textoParaRegla(comercio: string): string {
  const partes = normalizar(comercio).split(' ')
  while (partes.length > 1 && /\d/.test(partes[partes.length - 1]!)) partes.pop()
  return partes.join(' ')
}

/** Categorías que usa la propia lógica de la app: se pueden renombrar pero no borrar. */
export const CATEGORIAS_PROTEGIDAS: ReadonlySet<string> = new Set([
  CAT.bizumEnviado,
  CAT.bizumRecibido,
  CAT.transferenciasEnviadas,
  CAT.transferenciasRecibidas,
  CAT.devoluciones,
  CAT.otrosGastos,
  CAT.otrosIngresos,
])
