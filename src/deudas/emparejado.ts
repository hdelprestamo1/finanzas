// Emparejado de Bizum y transferencias con deudas (§10.3). SIEMPRE pide confirmación:
// estas funciones solo proponen; asignar lo hace el usuario.
//
// Recibidos (importe > 0) → candidatas: personas que te deben (saldo > 0).
// Enviados  (importe < 0) → candidatas: personas a las que debes (saldo < 0).
//   1. Sugerencia FUERTE si el nombre detectado en el concepto o alguna palabra del texto
//      libre coincide (palabra completa) con el nombre de la persona o con uno de sus alias.
//      Las palabras de Ajustes.miNombre se ignoran.
//   2. Si no hay ninguna fuerte: sugerencia DÉBIL si el importe coincide exactamente con lo
//      pendiente de UNA sola persona.
//   3. Si no, no se pregunta.
// Solo se consideran movimientos posteriores o iguales a la primera deuda de la persona
// (un Bizum anterior a la deuda no puede ser su pago).

import type { EstadoApp, Movimiento, Persona } from '../estado/tipos'
import { contienePalabras } from '../categorias/clasificar'
import { normalizar, palabras } from '../utilidades/texto'
import { saldos } from './saldos'

export const DIAS_BIZUM_SIN_ASIGNAR = 60
const LONGITUD_MINIMA_NOMBRE = 3

export interface Candidato {
  persona: Persona
  saldo: number
  fuerza: 'fuerte' | 'debil'
  motivo: 'alias' | 'nombre' | 'importe'
}

export interface Pregunta {
  movimiento: Movimiento
  candidatos: Candidato[] // ordenados: el más probable primero
}

/** ¿El movimiento puede ser un pago entre personas y está pendiente de decidir? */
export function esEmparejable(m: Movimiento, estado: EstadoApp): boolean {
  if (m.tipo !== 'bizum' && m.tipo !== 'transferencia') return false
  if (estado.pagos.some((p) => p.movimientoId === m.id)) return false
  return !(estado.descartados ?? []).includes(m.id)
}

/** Palabras del texto del movimiento, sin las del propio usuario. */
function palabrasDelMovimiento(m: Movimiento, miNombre: Set<string>): string[] {
  const texto = [m.nombreEnConcepto ?? '', m.textoLibre ?? ''].join(' ')
  return palabras(texto).filter((p) => !miNombre.has(p))
}

function textoDelMovimiento(m: Movimiento): string {
  return normalizar([m.nombreEnConcepto ?? '', m.textoLibre ?? ''].join(' '))
}

function coincidencia(
  m: Movimiento,
  persona: Persona,
  palabrasMov: string[],
  miNombre: Set<string>,
): 'alias' | 'nombre' | null {
  if (palabrasMov.length === 0) return null
  const texto = textoDelMovimiento(m)
  if (persona.aliasTexto.some((a) => contienePalabras(texto, a))) return 'alias'
  const delNombre = palabras(persona.nombre).filter(
    (p) => p.length >= LONGITUD_MINIMA_NOMBRE && !miNombre.has(p),
  )
  return delNombre.some((p) => palabrasMov.includes(p)) ? 'nombre' : null
}

/** Sugerencias para un movimiento (vacío = no preguntar). */
export function sugerencias(m: Movimiento, estado: EstadoApp): Candidato[] {
  if (!esEmparejable(m, estado) || m.importe === 0) return []
  const mapa = saldos(estado)
  const primeraDeuda = new Map<string, string>()
  for (const d of estado.deudas) {
    if (d.eliminada) continue
    const f = primeraDeuda.get(d.personaId)
    if (!f || d.fecha < f) primeraDeuda.set(d.personaId, d.fecha)
  }

  const recibido = m.importe > 0
  const posibles = estado.personas
    .map((persona) => ({ persona, saldo: mapa.get(persona.id) ?? 0 }))
    .filter(({ persona, saldo }) => {
      const desde = primeraDeuda.get(persona.id)
      return (recibido ? saldo > 0 : saldo < 0) && desde !== undefined && m.fecha >= desde
    })
  if (posibles.length === 0) return []

  const miNombre = new Set(estado.ajustes.miNombre.flatMap((n) => palabras(n)))
  const palabrasMov = palabrasDelMovimiento(m, miNombre)

  const fuertes: Candidato[] = []
  for (const { persona, saldo } of posibles) {
    const motivo = coincidencia(m, persona, palabrasMov, miNombre)
    if (motivo) fuertes.push({ persona, saldo, fuerza: 'fuerte', motivo })
  }
  if (fuertes.length) {
    const importe = Math.abs(m.importe)
    return fuertes.sort(
      (a, b) =>
        (a.motivo === 'alias' ? 0 : 1) - (b.motivo === 'alias' ? 0 : 1) ||
        Math.abs(Math.abs(a.saldo) - importe) - Math.abs(Math.abs(b.saldo) - importe) ||
        a.persona.nombre.localeCompare(b.persona.nombre, 'es'),
    )
  }

  const exactas = posibles.filter(({ saldo }) => Math.abs(saldo) === Math.abs(m.importe))
  if (exactas.length === 1) {
    const { persona, saldo } = exactas[0]!
    return [{ persona, saldo, fuerza: 'debil', motivo: 'importe' }]
  }
  return []
}

/** Preguntas pendientes, de la más reciente a la más antigua. */
export function preguntasPendientes(estado: EstadoApp): Pregunta[] {
  const preguntas: Pregunta[] = []
  for (let i = estado.movimientos.length - 1; i >= 0; i--) {
    const movimiento = estado.movimientos[i]!
    const candidatos = sugerencias(movimiento, estado)
    if (candidatos.length) preguntas.push({ movimiento, candidatos })
  }
  return preguntas
}

/**
 * «Bizum enviados sin asignar» de los últimos 60 días (§10.3): enviados, sin pago,
 * no descartados y sin sugerencia (los que tienen sugerencia ya salen como pregunta).
 */
export function bizumEnviadosSinAsignar(estado: EstadoApp, hoy: string): Movimiento[] {
  const limite = restarDias(hoy, DIAS_BIZUM_SIN_ASIGNAR)
  return estado.movimientos
    .filter(
      (m) =>
        m.tipo === 'bizum' &&
        m.importe < 0 &&
        m.fecha >= limite &&
        esEmparejable(m, estado) &&
        sugerencias(m, estado).length === 0,
    )
    .reverse()
}

function restarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10)
}

/** Texto que se propone recordar como alias al asignar a otra persona. */
export function textoParaAlias(m: Movimiento): string | null {
  const t = (m.nombreEnConcepto ?? m.textoLibre ?? '').trim()
  return t ? normalizar(t) : null
}
