import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerHoja } from '../src/importador/leerHoja'
import { parsearFilasKutxabank } from '../src/importador/kutxabank'
import { preverImportacion } from '../src/importador/fusionar'
import { importarExtracto } from '../src/categorias/operaciones'
import { estadoInicial, type EstadoApp, type Movimiento } from '../src/estado/tipos'
import { crearPersona } from '../src/personas/operaciones'
import {
  asignarMovimiento,
  crearDeuda,
  desasignarMovimiento,
  descartarMovimiento,
  eliminarDeuda,
  eliminarPago,
  marcarSaldada,
} from '../src/deudas/operaciones'
import { historialPersona, personasConSaldo, saldoPersona } from '../src/deudas/saldos'
import {
  bizumEnviadosSinAsignar,
  preguntasPendientes,
  sugerencias,
  textoParaAlias,
} from '../src/deudas/emparejado'

let base: EstadoApp

beforeAll(async () => {
  const b = readFileSync(new URL('./fixtures/extracto-ejemplo.xls', import.meta.url))
  const extracto = parsearFilasKutxabank(
    await leerHoja(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'x.xls'),
  )
  base = importarExtracto(estadoInicial(), preverImportacion(extracto, []), {
    importacionId: 'imp',
    nombreArchivo: 'x.xls',
    fecha: '2026-03-10',
  })
})

const mov = (e: EstadoApp, concepto: string): Movimiento =>
  e.movimientos.find((m) => m.concepto === concepto)!

/** Estado con personas y deudas inventadas. Devuelve también sus ids. */
function conPersonas(nombres: string[], estado = base) {
  let e = estado
  const ids: Record<string, string> = {}
  for (const n of nombres) {
    const r = crearPersona(e, n)
    e = r.estado
    ids[n] = r.persona.id
  }
  return { e, ids }
}

const deuda = (
  e: EstadoApp,
  personaId: string,
  importe: number,
  direccion: 'me_debe' | 'le_debo' = 'me_debe',
  fecha = '2026-03-01',
) => crearDeuda(e, { personaId, direccion, importe, concepto: 'Prueba', fecha })

describe('saldo con cada persona (§7)', () => {
  it('pago parcial: se resta y queda pendiente el resto', () => {
    let { e, ids } = conPersonas(['Andres'])
    e = deuda(e, ids.Andres!, 6000)
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Andres clases martes').id, ids.Andres!) // +45
    expect(saldoPersona(e, ids.Andres!)).toBe(1500)
  })

  it('pago exacto: queda al día', () => {
    let { e, ids } = conPersonas(['Lucia'])
    e = deuda(e, ids.Lucia!, 3000)
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Lucia').id, ids.Lucia!) // +30
    expect(saldoPersona(e, ids.Lucia!)).toBe(0)
    expect(personasConSaldo(e)).toHaveLength(0)
  })

  it('pago de más: el saldo cambia de signo (Andres debe 40, paga 45 → le debes 5)', () => {
    let { e, ids } = conPersonas(['Andres'])
    e = deuda(e, ids.Andres!, 4000)
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Andres clases martes').id, ids.Andres!)
    expect(saldoPersona(e, ids.Andres!)).toBe(-500)
  })

  it('le debo y yo pago con un Bizum enviado', () => {
    let { e, ids } = conPersonas(['Marta'])
    e = deuda(e, ids.Marta!, 2200, 'le_debo')
    expect(saldoPersona(e, ids.Marta!)).toBe(-2200)
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM cena viernes').id, ids.Marta!) // −22
    expect(saldoPersona(e, ids.Marta!)).toBe(0)
  })

  it('deudas eliminadas no cuentan; marcar como saldada crea un pago manual', () => {
    let { e, ids } = conPersonas(['Ana'])
    e = deuda(e, ids.Ana!, 1000)
    e = deuda(e, ids.Ana!, 500)
    e = eliminarDeuda(e, e.deudas.at(-1)!.id)
    expect(saldoPersona(e, ids.Ana!)).toBe(1000)
    e = marcarSaldada(e, ids.Ana!, '2026-03-20')
    expect(saldoPersona(e, ids.Ana!)).toBe(0)
    expect(e.pagos.at(-1)).toMatchObject({ importe: 1000, manual: true })
    // También en sentido contrario.
    e = deuda(e, ids.Ana!, 700, 'le_debo')
    e = marcarSaldada(e, ids.Ana!, '2026-03-21')
    expect(saldoPersona(e, ids.Ana!)).toBe(0)
    expect(e.pagos.at(-1)!.importe).toBe(-700)
  })

  it('personas con saldo, ordenadas por importe', () => {
    let { e, ids } = conPersonas(['A', 'B', 'C'])
    e = deuda(e, ids.A!, 1000)
    e = deuda(e, ids.B!, 3000, 'le_debo')
    expect(personasConSaldo(e).map((x) => [x.persona.nombre, x.saldo])).toEqual([
      ['B', -3000],
      ['A', 1000],
    ])
  })
})

describe('pagos vinculados a movimientos', () => {
  it('un movimiento solo puede estar vinculado a un pago', () => {
    let { e, ids } = conPersonas(['Lucia', 'Pepe'])
    e = deuda(e, ids.Lucia!, 3000)
    e = deuda(e, ids.Pepe!, 3000)
    const id = mov(e, 'ENVIO BIZUM Lucia').id
    e = asignarMovimiento(e, id, ids.Lucia!)
    e = asignarMovimiento(e, id, ids.Pepe!)
    expect(e.pagos.filter((p) => p.movimientoId === id)).toHaveLength(1)
    expect(saldoPersona(e, ids.Lucia!)).toBe(3000)
    expect(saldoPersona(e, ids.Pepe!)).toBe(0)
    expect(mov(e, 'ENVIO BIZUM Lucia').personaId).toBe(ids.Pepe)
  })

  it('eliminar el pago o desasignar deja el movimiento libre', () => {
    let { e, ids } = conPersonas(['Lucia'])
    e = deuda(e, ids.Lucia!, 3000)
    const id = mov(e, 'ENVIO BIZUM Lucia').id
    const asignado = asignarMovimiento(e, id, ids.Lucia!)
    const e1 = eliminarPago(asignado, asignado.pagos.at(-1)!.id)
    expect(mov(e1, 'ENVIO BIZUM Lucia').personaId).toBeUndefined()
    expect(saldoPersona(e1, ids.Lucia!)).toBe(3000)
    const e2 = desasignarMovimiento(asignarMovimiento(e, id, ids.Lucia!), id)
    expect(e2.pagos).toHaveLength(0)
    expect(saldoPersona(e2, ids.Lucia!)).toBe(3000)
  })

  it('historial: deudas y pagos, del más reciente al más antiguo', () => {
    let { e, ids } = conPersonas(['Lucia'])
    e = deuda(e, ids.Lucia!, 3000, 'me_debe', '2026-03-01')
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Lucia').id, ids.Lucia!)
    expect(historialPersona(e, ids.Lucia!).map((x) => x.tipo)).toEqual(['pago', 'deuda'])
  })
})

describe('emparejado (§10.3)', () => {
  it('nombre en el texto del Bizum → sugerencia fuerte', () => {
    let { e, ids } = conPersonas(['Andrés García'])
    e = deuda(e, ids['Andrés García']!, 6000)
    const s = sugerencias(mov(e, 'ENVIO BIZUM Andres clases martes'), e)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ fuerza: 'fuerte', motivo: 'nombre', saldo: 6000 })
  })

  it('«Bizum de JORGE» → sugerencia fuerte por nombreEnConcepto', () => {
    let { e, ids } = conPersonas(['Jorge'])
    e = deuda(e, ids.Jorge!, 1250)
    expect(sugerencias(mov(e, 'ENVIO BIZUM Bizum de Jorge'), e)[0]).toMatchObject({ fuerza: 'fuerte' })
  })

  it('palabra completa: «ale» no es Alejandro', () => {
    let { e, ids } = conPersonas(['Alejandro'])
    e = deuda(e, ids.Alejandro!, 999)
    const m: Movimiento = { ...mov(e, 'ENVIO BIZUM Lucia'), id: 'x', textoLibre: 'taxi ale' }
    expect(sugerencias(m, { ...e, movimientos: [...e.movimientos, m] })).toEqual([])
  })

  it('alias o apodo → sugerencia fuerte (Tiburon es de Pepe)', () => {
    let { e, ids } = conPersonas(['Pepe'])
    e = deuda(e, ids.Pepe!, 5000)
    expect(sugerencias(mov(e, 'ENVIO BIZUM Tiburon'), e)).toEqual([])
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Lucia').id, ids.Pepe!, 'tiburón')
    expect(e.personas[0]!.aliasTexto).toEqual(['TIBURON'])
    expect(sugerencias(mov(e, 'ENVIO BIZUM Tiburon'), e)[0]).toMatchObject({ fuerza: 'fuerte', motivo: 'alias' })
  })

  it('mi nombre se ignora: «ENVIO BIZUM Titular» no sugiere a nadie', () => {
    let { e, ids } = conPersonas(['Titular Otro'])
    e = deuda(e, ids['Titular Otro']!, 400, 'le_debo')
    expect(sugerencias(mov(e, 'ENVIO BIZUM Titular'), e)).toHaveLength(1) // sin miNombre sí casaría
    e = { ...e, ajustes: { ...e.ajustes, miNombre: ['Titular'] } }
    // Además, el importe (4,00) coincide con lo que le debo: por eso queda una sugerencia DÉBIL, no fuerte.
    expect(sugerencias(mov(e, 'ENVIO BIZUM Titular'), e)).toEqual([
      expect.objectContaining({ fuerza: 'debil', motivo: 'importe' }),
    ])
    e = deuda(e, ids['Titular Otro']!, 100, 'le_debo')
    expect(sugerencias(mov(e, 'ENVIO BIZUM Titular'), e)).toEqual([])
  })

  it('coincidencia exacta de importe con UNA sola persona → sugerencia débil', () => {
    let { e, ids } = conPersonas(['Rosa', 'Luis'])
    e = deuda(e, ids.Rosa!, 2500) // «entrada concierto» +25,00 sin nombre
    e = deuda(e, ids.Luis!, 1000)
    const s = sugerencias(mov(e, 'ENVIO BIZUM entrada concierto'), e)
    expect(s).toEqual([expect.objectContaining({ fuerza: 'debil', motivo: 'importe' })])
    expect(s[0]!.persona.nombre).toBe('Rosa')
  })

  it('importe exacto con dos personas → no se pregunta', () => {
    let { e, ids } = conPersonas(['Rosa', 'Luis'])
    e = deuda(e, ids.Rosa!, 2500)
    e = deuda(e, ids.Luis!, 2500)
    expect(sugerencias(mov(e, 'ENVIO BIZUM entrada concierto'), e)).toEqual([])
  })

  it('varios candidatos por nombre: ordenados (el saldo más cercano al importe primero)', () => {
    let { e, ids } = conPersonas(['Jorge Pérez', 'Jorge Ruiz'])
    e = deuda(e, ids['Jorge Pérez']!, 9000)
    e = deuda(e, ids['Jorge Ruiz']!, 1300)
    const s = sugerencias(mov(e, 'ENVIO BIZUM Bizum de Jorge'), e) // 12,50
    expect(s.map((c) => c.persona.nombre)).toEqual(['Jorge Ruiz', 'Jorge Pérez'])
  })

  it('recibidos solo entre quien te debe; enviados solo entre a quien debes', () => {
    let { e, ids } = conPersonas(['Lucia'])
    e = deuda(e, ids.Lucia!, 3000, 'le_debo') // le debo yo
    expect(sugerencias(mov(e, 'ENVIO BIZUM Lucia'), e)).toEqual([]) // es un Bizum recibido
  })

  it('un Bizum anterior a la primera deuda de la persona no se sugiere', () => {
    let { e, ids } = conPersonas(['Lucia'])
    e = deuda(e, ids.Lucia!, 3000, 'me_debe', '2026-03-05') // Bizum de Lucia: 03/03
    expect(sugerencias(mov(e, 'ENVIO BIZUM Lucia'), e)).toEqual([])
  })

  it('«No» → no volver a preguntar; asignado → tampoco', () => {
    let { e, ids } = conPersonas(['Lucia', 'Andres'])
    e = deuda(e, ids.Lucia!, 3000)
    e = deuda(e, ids.Andres!, 6000)
    expect(preguntasPendientes(e)).toHaveLength(2)
    e = descartarMovimiento(e, mov(e, 'ENVIO BIZUM Lucia').id)
    expect(preguntasPendientes(e).map((p) => p.movimiento.concepto)).toEqual([
      'ENVIO BIZUM Andres clases martes',
    ])
    e = asignarMovimiento(e, mov(e, 'ENVIO BIZUM Andres clases martes').id, ids.Andres!)
    expect(preguntasPendientes(e)).toHaveLength(0)
  })

  it('Bizum enviados sin asignar de los últimos 60 días', () => {
    const e = base
    expect(bizumEnviadosSinAsignar(e, '2026-03-10').map((m) => m.concepto)).toEqual([
      'ENVIO BIZUM cena viernes',
      'ENVIO BIZUM Titular',
      'ENVIO BIZUM Envio de dinero con Bizum',
    ])
    expect(bizumEnviadosSinAsignar(e, '2026-06-30')).toEqual([])
    const e2 = descartarMovimiento(e, mov(e, 'ENVIO BIZUM Titular').id)
    expect(bizumEnviadosSinAsignar(e2, '2026-03-10')).toHaveLength(2)
  })

  it('texto propuesto para recordar como alias', () => {
    expect(textoParaAlias(mov(base, 'ENVIO BIZUM Tiburon'))).toBe('TIBURON')
    expect(textoParaAlias(mov(base, 'ENVIO BIZUM Bizum de JORGE'))).toBe('JORGE')
    expect(textoParaAlias(mov(base, 'ENVIO BIZUM Sin concepto'))).toBeNull()
  })
})
