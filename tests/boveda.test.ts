import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ContrasenaDemasiadoCorta,
  ContrasenaIncorrecta,
  borrarTodo,
  cambiarContrasena,
  crearBoveda,
  desbloquear,
  existeBoveda,
  guardarEstado,
} from '../src/seguridad/boveda'
import { estadoInicial, type EstadoApp } from '../src/estado/tipos'

const ITER_TEST = 1_000
const CONTRASENA = 'mi frase secreta'

function estadoConDatos(): EstadoApp {
  return {
    ...estadoInicial(),
    deudas: [
      {
        id: 'd1',
        personaId: 'p1',
        direccion: 'me_debe',
        importe: 4000,
        concepto: 'Cena',
        fecha: '2026-03-06',
        eliminada: false,
      },
    ],
  }
}

async function registroCrudo(): Promise<unknown> {
  return new Promise((ok, mal) => {
    const peticion = indexedDB.open('finanzas')
    peticion.onerror = () => mal(peticion.error)
    peticion.onsuccess = () => {
      const get = peticion.result.transaction('boveda').objectStore('boveda').get('principal')
      get.onsuccess = () => {
        peticion.result.close()
        ok(get.result)
      }
    }
  })
}

beforeEach(async () => {
  await borrarTodo()
})

describe('bóveda', () => {
  it('no existe hasta que se crea', async () => {
    expect(await existeBoveda()).toBe(false)
    await crearBoveda(CONTRASENA, estadoInicial(), ITER_TEST)
    expect(await existeBoveda()).toBe(true)
  })

  it('exige al menos 10 caracteres', async () => {
    await expect(crearBoveda('corta', estadoInicial(), ITER_TEST)).rejects.toBeInstanceOf(
      ContrasenaDemasiadoCorta,
    )
    expect(await existeBoveda()).toBe(false)
  })

  it('desbloquea con la contraseña correcta y devuelve el estado', async () => {
    await crearBoveda(CONTRASENA, estadoConDatos(), ITER_TEST)
    const { estado } = await desbloquear(CONTRASENA)
    expect(estado).toEqual(estadoConDatos())
  })

  it('rechaza una contraseña incorrecta', async () => {
    await crearBoveda(CONTRASENA, estadoInicial(), ITER_TEST)
    await expect(desbloquear('otra frase secreta')).rejects.toBeInstanceOf(ContrasenaIncorrecta)
  })

  it('guarda los cambios cifrados (nada legible en IndexedDB)', async () => {
    const sesion = await crearBoveda(CONTRASENA, estadoInicial(), ITER_TEST)
    await guardarEstado(sesion, estadoConDatos())
    const crudo = JSON.stringify(await registroCrudo(), (_, v) =>
      v instanceof Uint8Array ? new TextDecoder('latin1').decode(v) : v,
    )
    expect(crudo).not.toContain('Cena')
    expect(crudo).not.toContain('me_debe')
    expect((await desbloquear(CONTRASENA)).estado).toEqual(estadoConDatos())
  })

  it('mantiene el orden de escrituras seguidas (gana la última)', async () => {
    const sesion = await crearBoveda(CONTRASENA, estadoInicial(), ITER_TEST)
    const escrituras = [1, 2, 3, 4, 5].map((m) =>
      guardarEstado(sesion, { ...estadoInicial(), ajustes: { miNombre: [], minutosBloqueo: m } }),
    )
    await Promise.all(escrituras)
    expect((await desbloquear(CONTRASENA)).estado.ajustes.minutosBloqueo).toBe(5)
  })

  it('cambia la contraseña: la nueva funciona y la antigua no', async () => {
    await crearBoveda(CONTRASENA, estadoConDatos(), ITER_TEST)
    const nueva = 'otra frase aún más larga'
    const sesion = await cambiarContrasena(CONTRASENA, nueva, estadoConDatos(), ITER_TEST)
    await expect(desbloquear(CONTRASENA)).rejects.toBeInstanceOf(ContrasenaIncorrecta)
    expect((await desbloquear(nueva)).estado).toEqual(estadoConDatos())
    // Las escrituras posteriores con la sesión nueva siguen funcionando.
    await guardarEstado(sesion, estadoInicial())
    expect((await desbloquear(nueva)).estado).toEqual(estadoInicial())
  })

  it('no cambia la contraseña si la actual es incorrecta', async () => {
    await crearBoveda(CONTRASENA, estadoConDatos(), ITER_TEST)
    await expect(
      cambiarContrasena('no es la buena', 'otra frase larga', estadoConDatos(), ITER_TEST),
    ).rejects.toBeInstanceOf(ContrasenaIncorrecta)
    expect((await desbloquear(CONTRASENA)).estado).toEqual(estadoConDatos())
  })

  it('borrarTodo elimina los datos', async () => {
    await crearBoveda(CONTRASENA, estadoConDatos(), ITER_TEST)
    await borrarTodo()
    expect(await existeBoveda()).toBe(false)
  })
})
