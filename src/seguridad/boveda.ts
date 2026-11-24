// "Bóveda": el estado completo de la app cifrado en IndexedDB (§5.2).
//
// Se guarda un único registro con:
//   - sal e iteraciones de PBKDF2 (no son secretos),
//   - un verificador cifrado (texto conocido) para detectar contraseña incorrecta,
//   - el estado de la app cifrado.
// La clave solo vive en memoria mientras la app está desbloqueada.

import { openDB, type IDBPDatabase } from 'idb'
import {
  type Bytes,
  type Cifrado,
  ErrorDescifrado,
  ITERACIONES_PBKDF2,
  cifrarJSON,
  derivarClave,
  descifrarJSON,
  generarSal,
} from './cifrado'
import type { EstadoApp } from '../estado/tipos'

export const LONGITUD_MINIMA_CONTRASENA = 10

const NOMBRE_BD = 'finanzas'
const ALMACEN = 'boveda'
const CLAVE_REGISTRO = 'principal'

const CONTEXTO_VERIFICADOR = 'finanzas/verificador/v1'
const CONTEXTO_ESTADO = 'finanzas/estado/v1'
const TEXTO_VERIFICADOR = 'finanzas-ok'

interface RegistroBoveda {
  version: 1
  sal: Bytes
  iteraciones: number
  verificador: Cifrado
  estado: Cifrado
}

/** Lo necesario para guardar mientras la app está desbloqueada. Solo en memoria. */
export interface Sesion {
  readonly clave: CryptoKey
  readonly sal: Bytes
  readonly iteraciones: number
  readonly verificador: Cifrado
}

export class ContrasenaIncorrecta extends Error {
  constructor() {
    super('Contraseña incorrecta')
    this.name = 'ContrasenaIncorrecta'
  }
}

export class ContrasenaDemasiadoCorta extends Error {
  constructor() {
    super(`La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`)
    this.name = 'ContrasenaDemasiadoCorta'
  }
}

let conexion: Promise<IDBPDatabase> | null = null

function bd(): Promise<IDBPDatabase> {
  conexion ??= openDB(NOMBRE_BD, 1, {
    upgrade(db) {
      db.createObjectStore(ALMACEN)
    },
  })
  return conexion
}

async function leerRegistro(): Promise<RegistroBoveda | undefined> {
  return (await bd()).get(ALMACEN, CLAVE_REGISTRO)
}

async function escribirRegistro(registro: RegistroBoveda): Promise<void> {
  await (await bd()).put(ALMACEN, registro, CLAVE_REGISTRO)
}

// Las escrituras se encadenan para que nunca se pisen (la última siempre gana).
let colaEscritura: Promise<unknown> = Promise.resolve()
function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = colaEscritura.then(tarea, tarea)
  colaEscritura = resultado.catch(() => undefined)
  return resultado
}

function comprobarLongitud(contrasena: string): void {
  if ([...contrasena].length < LONGITUD_MINIMA_CONTRASENA) throw new ContrasenaDemasiadoCorta()
}

async function nuevaSesion(contrasena: string, iteraciones: number): Promise<Sesion> {
  const sal = generarSal()
  const clave = await derivarClave(contrasena, sal, iteraciones)
  const verificador = await cifrarJSON(clave, TEXTO_VERIFICADOR, CONTEXTO_VERIFICADOR)
  return { clave, sal, iteraciones, verificador }
}

async function registroDe(sesion: Sesion, estado: EstadoApp): Promise<RegistroBoveda> {
  return {
    version: 1,
    sal: sesion.sal,
    iteraciones: sesion.iteraciones,
    verificador: sesion.verificador,
    estado: await cifrarJSON(sesion.clave, estado, CONTEXTO_ESTADO),
  }
}

/** Abre la sesión comprobando la contraseña contra un registro. */
async function abrirSesion(registro: RegistroBoveda, contrasena: string): Promise<Sesion> {
  const clave = await derivarClave(contrasena, registro.sal, registro.iteraciones)
  try {
    const texto = await descifrarJSON<string>(clave, registro.verificador, CONTEXTO_VERIFICADOR)
    if (texto !== TEXTO_VERIFICADOR) throw new ContrasenaIncorrecta()
  } catch (e) {
    if (e instanceof ErrorDescifrado) throw new ContrasenaIncorrecta()
    throw e
  }
  return { clave, sal: registro.sal, iteraciones: registro.iteraciones, verificador: registro.verificador }
}

export async function existeBoveda(): Promise<boolean> {
  return (await leerRegistro()) !== undefined
}

export async function crearBoveda(
  contrasena: string,
  estado: EstadoApp,
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<Sesion> {
  comprobarLongitud(contrasena)
  if (await existeBoveda()) throw new Error('Ya existe una bóveda')
  const sesion = await nuevaSesion(contrasena, iteraciones)
  await enCola(async () => escribirRegistro(await registroDe(sesion, estado)))
  return sesion
}

export async function desbloquear(contrasena: string): Promise<{ sesion: Sesion; estado: EstadoApp }> {
  const registro = await leerRegistro()
  if (!registro) throw new Error('No hay datos guardados')
  const sesion = await abrirSesion(registro, contrasena)
  const estado = await descifrarJSON<EstadoApp>(sesion.clave, registro.estado, CONTEXTO_ESTADO)
  return { sesion, estado }
}

/** Vuelve a cifrar y guardar todo el estado (se llama tras cada cambio). */
export function guardarEstado(sesion: Sesion, estado: EstadoApp): Promise<void> {
  return enCola(async () => escribirRegistro(await registroDe(sesion, estado)))
}

/** Comprueba la contraseña actual y re-cifra todo con una sal y clave nuevas. */
export async function cambiarContrasena(
  actual: string,
  nueva: string,
  estado: EstadoApp,
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<Sesion> {
  comprobarLongitud(nueva)
  const registro = await leerRegistro()
  if (!registro) throw new Error('No hay datos guardados')
  await abrirSesion(registro, actual)
  const sesion = await nuevaSesion(nueva, iteraciones)
  // Un único put: o queda todo con la contraseña nueva o todo con la antigua.
  await enCola(async () => escribirRegistro(await registroDe(sesion, estado)))
  return sesion
}

/** Borra todos los datos de la app en este dispositivo. Irreversible. */
export function borrarTodo(): Promise<void> {
  return enCola(async () => (await bd()).clear(ALMACEN))
}
