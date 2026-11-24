import { describe, expect, it } from 'vitest'
import {
  BYTES_SAL,
  ErrorDescifrado,
  ITERACIONES_PBKDF2,
  cifrar,
  cifrarJSON,
  derivarClave,
  descifrar,
  descifrarJSON,
  generarSal,
} from '../src/seguridad/cifrado'

// En la mayoría de tests se usan pocas iteraciones para que vayan rápidos;
// un test comprueba el valor real por defecto.
const ITER_TEST = 1_000
const CTX = 'test/contexto'
const texto = (s: string) => new TextEncoder().encode(s)

describe('cifrado', () => {
  it('usa al menos 600 000 iteraciones y sal de 16 bytes', () => {
    expect(ITERACIONES_PBKDF2).toBeGreaterThanOrEqual(600_000)
    expect(BYTES_SAL).toBe(16)
    expect(generarSal()).toHaveLength(16)
  })

  it('cifra y descifra (ida y vuelta)', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    const original = { movimientos: [{ importe: -240, concepto: 'COMPRA T.C. PANADERÍA' }] }
    const c = await cifrarJSON(clave, original, CTX)
    expect(await descifrarJSON(clave, c, CTX)).toEqual(original)
  })

  it('el texto cifrado no contiene el texto original', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    const c = await cifrar(clave, texto('SECRETO-SECRETO'), CTX)
    expect(new TextDecoder('latin1').decode(c.datos)).not.toContain('SECRETO')
  })

  it('usa un IV distinto en cada cifrado', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    const a = await cifrar(clave, texto('igual'), CTX)
    const b = await cifrar(clave, texto('igual'), CTX)
    expect(a.iv).toHaveLength(12)
    expect(a.iv).not.toEqual(b.iv)
    expect(a.datos).not.toEqual(b.datos)
  })

  it('falla con contraseña incorrecta', async () => {
    const sal = generarSal()
    const buena = await derivarClave('contraseña buena', sal, ITER_TEST)
    const mala = await derivarClave('contraseña mala!', sal, ITER_TEST)
    const c = await cifrar(buena, texto('datos'), CTX)
    await expect(descifrar(mala, c, CTX)).rejects.toBeInstanceOf(ErrorDescifrado)
  })

  it('falla con la misma contraseña y otra sal', async () => {
    const a = await derivarClave('misma contraseña', generarSal(), ITER_TEST)
    const b = await derivarClave('misma contraseña', generarSal(), ITER_TEST)
    const c = await cifrar(a, texto('datos'), CTX)
    await expect(descifrar(b, c, CTX)).rejects.toBeInstanceOf(ErrorDescifrado)
  })

  it('detecta datos alterados', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    const c = await cifrar(clave, texto('importe: 100'), CTX)
    const alterado = new Uint8Array(c.datos)
    alterado[0] ^= 1
    await expect(descifrar(clave, { iv: c.iv, datos: alterado }, CTX)).rejects.toBeInstanceOf(
      ErrorDescifrado,
    )
  })

  it('no acepta un blob cifrado para otro contexto', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    const c = await cifrar(clave, texto('datos'), 'contexto/a')
    await expect(descifrar(clave, c, 'contexto/b')).rejects.toBeInstanceOf(ErrorDescifrado)
  })

  it('normaliza la contraseña (ñ compuesta = ñ precompuesta)', async () => {
    const sal = generarSal()
    const precompuesta = await derivarClave('contraseña12', sal, ITER_TEST)
    const compuesta = await derivarClave('contraseña12', sal, ITER_TEST)
    const c = await cifrar(precompuesta, texto('datos'), CTX)
    await expect(descifrar(compuesta, c, CTX)).resolves.toEqual(texto('datos'))
  })

  it('funciona con las iteraciones reales por defecto', async () => {
    const sal = generarSal()
    const clave = await derivarClave('una contraseña larga', sal)
    const c = await cifrar(clave, texto('datos'), CTX)
    const otra = await derivarClave('una contraseña larga', sal)
    await expect(descifrar(otra, c, CTX)).resolves.toEqual(texto('datos'))
  })

  it('la clave no es extraíble', async () => {
    const clave = await derivarClave('una contraseña larga', generarSal(), ITER_TEST)
    expect(clave.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', clave)).rejects.toThrow()
  })
})
