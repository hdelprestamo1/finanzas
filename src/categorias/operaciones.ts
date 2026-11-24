// Cambios de categorías, reglas y categoría de movimientos (§9). Funciones puras
// EstadoApp → EstadoApp; tras cualquier cambio de reglas o categorías se reclasifica.

import type { Categoria, EstadoApp } from '../estado/tipos'
import { normalizar } from '../utilidades/texto'
import { CATEGORIAS_PROTEGIDAS, reclasificar } from './clasificar'
import { aplicarImportacion, preverImportacion, type PrevisionImportacion } from '../importador/fusionar'

function conReclasificacion(estado: EstadoApp): EstadoApp {
  return {
    ...estado,
    movimientos: reclasificar(estado.movimientos, estado.reglas, estado.categorias),
  }
}

/** Cambio manual: el movimiento ya no se reclasifica automáticamente. */
export function cambiarCategoriaMovimiento(
  estado: EstadoApp,
  movimientoId: string,
  categoriaId: string,
): EstadoApp {
  return conReclasificacion({
    ...estado,
    movimientos: estado.movimientos.map((m) =>
      m.id === movimientoId ? { ...m, categoriaId, categoriaManual: true } : m,
    ),
  })
}

/** Quita la marca manual y deja que las reglas decidan otra vez. */
export function restablecerCategoriaAutomatica(estado: EstadoApp, movimientoId: string): EstadoApp {
  return conReclasificacion({
    ...estado,
    movimientos: estado.movimientos.map((m) =>
      m.id === movimientoId ? { ...m, categoriaManual: false } : m,
    ),
  })
}

export function cambiarNota(estado: EstadoApp, movimientoId: string, nota: string): EstadoApp {
  const limpia = nota.trim()
  return {
    ...estado,
    movimientos: estado.movimientos.map((m) => {
      if (m.id !== movimientoId) return m
      const { nota: _anterior, ...resto } = m
      return limpia ? { ...resto, nota: limpia } : resto
    }),
  }
}

/**
 * "¿Aplicar a todos los de [comercio]?": crea (o sustituye) una regla de usuario
 * sobre el comercio y reclasifica los movimientos no editados a mano.
 */
export function crearReglaComercio(estado: EstadoApp, texto: string, categoriaId: string): EstadoApp {
  const contiene = normalizar(texto)
  if (!contiene) return estado
  const reglas = estado.reglas.filter((r) => !(r.campo === 'comercio' && r.contiene === contiene))
  reglas.push({ id: crypto.randomUUID(), campo: 'comercio', contiene, categoriaId, creadaPorUsuario: true })
  return conReclasificacion({ ...estado, reglas })
}

export function borrarRegla(estado: EstadoApp, reglaId: string): EstadoApp {
  return conReclasificacion({ ...estado, reglas: estado.reglas.filter((r) => r.id !== reglaId) })
}

export function crearCategoria(
  estado: EstadoApp,
  datos: Pick<Categoria, 'nombre' | 'tipo' | 'color'>,
): EstadoApp {
  const orden = Math.max(-1, ...estado.categorias.map((c) => c.orden)) + 1
  const categoria: Categoria = { id: crypto.randomUUID(), ...datos, nombre: datos.nombre.trim(), orden }
  return { ...estado, categorias: [...estado.categorias, categoria] }
}

export function editarCategoria(
  estado: EstadoApp,
  id: string,
  cambios: Partial<Pick<Categoria, 'nombre' | 'color' | 'tipo'>>,
): EstadoApp {
  return {
    ...estado,
    categorias: estado.categorias.map((c) =>
      c.id === id ? { ...c, ...cambios, ...(cambios.nombre ? { nombre: cambios.nombre.trim() } : {}) } : c,
    ),
  }
}

/**
 * Borra una categoría moviendo sus movimientos (y sus reglas de usuario) a `destinoId`.
 * Los movimientos movidos quedan como manuales para que no vuelvan a cambiar solos.
 */
export function borrarCategoria(estado: EstadoApp, id: string, destinoId: string): EstadoApp {
  if (CATEGORIAS_PROTEGIDAS.has(id)) throw new Error('Esta categoría no se puede borrar')
  if (id === destinoId || !estado.categorias.some((c) => c.id === destinoId)) {
    throw new Error('Categoría de destino no válida')
  }
  return conReclasificacion({
    ...estado,
    categorias: estado.categorias.filter((c) => c.id !== id),
    reglas: estado.reglas.map((r) => (r.categoriaId === id ? { ...r, categoriaId: destinoId } : r)),
    movimientos: estado.movimientos.map((m) =>
      m.categoriaId === id ? { ...m, categoriaId: destinoId, categoriaManual: true } : m,
    ),
  })
}

/** Nombre normalizado ya usado por otra categoría. */
export function nombreRepetido(estado: EstadoApp, nombre: string, excepto?: string): boolean {
  const n = normalizar(nombre)
  return estado.categorias.some((c) => c.id !== excepto && normalizar(c.nombre) === n)
}

// --- Importación ---------------------------------------------------------------

/** Añade los movimientos nuevos de un extracto y los clasifica con las reglas actuales. */
export function importarExtracto(
  estado: EstadoApp,
  prevision: PrevisionImportacion,
  datos: { importacionId: string; nombreArchivo: string; fecha: string },
): EstadoApp {
  // Se recalcula sobre el estado actual por si ha cambiado desde la vista previa.
  const actual = preverImportacion(prevision.extracto, estado.movimientos)
  const { movimientos, importacion } = aplicarImportacion(actual, estado.movimientos, datos)
  return conReclasificacion({
    ...estado,
    movimientos,
    importaciones: [...estado.importaciones, importacion],
  })
}

/** Categoría que recibiría cada fila de la vista previa (id de movimiento → categoría). */
export function categoriasPropuestas(
  estado: EstadoApp,
  prevision: PrevisionImportacion,
): Map<string, string> {
  const simulado = importarExtracto(estado, prevision, {
    importacionId: 'vista-previa',
    nombreArchivo: '',
    fecha: '',
  })
  return new Map(simulado.movimientos.map((m) => [m.id, m.categoriaId]))
}
