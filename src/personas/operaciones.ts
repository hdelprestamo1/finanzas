// Personas (§10.1): importar contactos, crear a mano, renombrar y alias.
import type { EstadoApp, Persona } from '../estado/tipos'
import { normalizar } from '../utilidades/texto'
import { claveTelefono, type ContactoLeido } from './vcard'

export interface ResultadoContactos {
  estado: EstadoApp
  nuevos: number
  actualizados: number
}

/**
 * Reimportar fusiona por teléfono o, si no, por nombre: no duplica personas.
 * A una persona existente solo se le añaden teléfonos nuevos (su nombre no cambia).
 */
export function importarContactos(estado: EstadoApp, contactos: ContactoLeido[]): ResultadoContactos {
  const personas = estado.personas.map((p) => ({ ...p, telefonos: [...p.telefonos] }))
  let nuevos = 0
  let actualizados = 0

  for (const c of contactos) {
    const claves = new Set(c.telefonos.map(claveTelefono).filter((k) => k.length >= 6))
    const existente =
      personas.find((p) => p.telefonos.some((t) => claves.has(claveTelefono(t)))) ??
      personas.find((p) => normalizar(p.nombre) === normalizar(c.nombre))

    if (existente) {
      const tiene = new Set(existente.telefonos.map(claveTelefono))
      const faltan = c.telefonos.filter((t) => !tiene.has(claveTelefono(t)))
      if (faltan.length) {
        existente.telefonos.push(...faltan)
        actualizados++
      }
    } else {
      personas.push({
        id: crypto.randomUUID(),
        nombre: c.nombre.trim(),
        telefonos: c.telefonos,
        aliasTexto: [],
        origen: 'vcf',
      })
      nuevos++
    }
  }
  return { estado: { ...estado, personas }, nuevos, actualizados }
}

export function crearPersona(estado: EstadoApp, nombre: string): { estado: EstadoApp; persona: Persona } {
  const persona: Persona = {
    id: crypto.randomUUID(),
    nombre: nombre.trim().replace(/\s+/g, ' '),
    telefonos: [],
    aliasTexto: [],
    origen: 'manual',
  }
  return { estado: { ...estado, personas: [...estado.personas, persona] }, persona }
}

export function renombrarPersona(estado: EstadoApp, id: string, nombre: string): EstadoApp {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) return estado
  return { ...estado, personas: estado.personas.map((p) => (p.id === id ? { ...p, nombre: limpio } : p)) }
}

export function agregarAlias(estado: EstadoApp, id: string, texto: string): EstadoApp {
  const alias = normalizar(texto)
  if (!alias) return estado
  return {
    ...estado,
    personas: estado.personas.map((p) =>
      p.id === id && !p.aliasTexto.includes(alias) ? { ...p, aliasTexto: [...p.aliasTexto, alias] } : p,
    ),
  }
}

export function quitarAlias(estado: EstadoApp, id: string, alias: string): EstadoApp {
  return {
    ...estado,
    personas: estado.personas.map((p) =>
      p.id === id ? { ...p, aliasTexto: p.aliasTexto.filter((a) => a !== alias) } : p,
    ),
  }
}

/** Búsqueda rápida por nombre (sin tildes ni mayúsculas) o por teléfono. */
export function buscarPersonas(personas: readonly Persona[], consulta: string, limite = 8): Persona[] {
  const q = normalizar(consulta)
  const digitos = consulta.replace(/\D/g, '')
  if (!q) return []
  const puntuadas = personas
    .map((p) => {
      const nombre = normalizar(p.nombre)
      let puntos = 0
      if (nombre.startsWith(q)) puntos = 3
      else if (nombre.split(' ').some((w) => w.startsWith(q))) puntos = 2
      else if (nombre.includes(q)) puntos = 1
      else if (digitos.length >= 3 && p.telefonos.some((t) => t.includes(digitos))) puntos = 1
      return { p, puntos }
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.p.nombre.localeCompare(b.p.nombre, 'es'))
  return puntuadas.slice(0, limite).map((x) => x.p)
}
