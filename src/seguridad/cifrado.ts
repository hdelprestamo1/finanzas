// Cifrado con WebCrypto (nativo del navegador, sin dependencias) — §5.2.
//  - Clave: PBKDF2-SHA256 con sal aleatoria de 16 bytes y ≥ 600 000 iteraciones.
//  - Datos: AES-GCM de 256 bits con IV aleatorio de 12 bytes en cada cifrado.
//  - La clave se crea como "no extraíble": ni siquiera la app puede leer sus bytes.

export type Bytes = Uint8Array<ArrayBuffer>

export const ITERACIONES_PBKDF2 = 600_000
export const BYTES_SAL = 16
const BYTES_IV = 12

export interface Cifrado {
  iv: Bytes
  datos: Bytes
}

/** Error al descifrar: contraseña incorrecta o datos alterados/corruptos. */
export class ErrorDescifrado extends Error {
  constructor() {
    super('No se han podido descifrar los datos')
    this.name = 'ErrorDescifrado'
  }
}

export function bytesAleatorios(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function generarSal(): Bytes {
  return bytesAleatorios(BYTES_SAL)
}

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export async function derivarClave(
  contrasena: string,
  sal: Bytes,
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<CryptoKey> {
  // NFC: una "ñ" escrita en el iPhone y en Windows da los mismos bytes.
  const material = await crypto.subtle.importKey(
    'raw',
    codificador.encode(contrasena.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * `contexto` se autentica junto a los datos (AES-GCM "additional data"): un blob
 * cifrado para un uso (p. ej. el verificador) no se puede hacer pasar por otro.
 */
export async function cifrar(clave: CryptoKey, datos: Bytes, contexto: string): Promise<Cifrado> {
  const iv = bytesAleatorios(BYTES_IV)
  const resultado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: codificador.encode(contexto) },
    clave,
    datos,
  )
  return { iv, datos: new Uint8Array(resultado) }
}

export async function descifrar(clave: CryptoKey, cifrado: Cifrado, contexto: string): Promise<Bytes> {
  try {
    const resultado = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: cifrado.iv, additionalData: codificador.encode(contexto) },
      clave,
      cifrado.datos,
    )
    return new Uint8Array(resultado)
  } catch {
    throw new ErrorDescifrado()
  }
}

export async function cifrarJSON(clave: CryptoKey, valor: unknown, contexto: string): Promise<Cifrado> {
  return cifrar(clave, codificador.encode(JSON.stringify(valor)), contexto)
}

export async function descifrarJSON<T>(clave: CryptoKey, cifrado: Cifrado, contexto: string): Promise<T> {
  return JSON.parse(decodificador.decode(await descifrar(clave, cifrado, contexto))) as T
}
