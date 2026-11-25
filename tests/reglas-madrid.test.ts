import { describe, expect, it } from 'vitest'
import { REGLAS_POR_DEFECTO, reclasificar } from '../src/categorias/clasificar'
import { estadoInicial, type EstadoApp, type Movimiento } from '../src/estado/tipos'
import { actualizarDatos } from '../src/estado/migraciones'
import { mesesConDatos, serieSaldoDiaria } from '../src/estadisticas/resumen'

function compra(comercio: string, importe = -1000, fecha = '2026-11-01'): Movimiento {
  return {
    id: comercio + fecha + importe,
    fecha,
    fechaValor: fecha,
    importe,
    saldo: 0,
    concepto: 'COMPRA T.C. ' + comercio,
    tipo: 'tarjeta',
    comercio,
    categoriaId: 'otros-gastos',
    categoriaManual: false,
    importacionId: 'x',
  }
}
const categoria = (comercio: string) =>
  reclasificar([compra(comercio)], [], estadoInicial().categorias)[0]!.categoriaId

describe('reglas por defecto (Madrid, estudiante)', () => {
  it.each([
    ['MERCADONA AV ALBUFERA', 'supermercado'],
    ['CARREFOUR EXPRESS MADRID', 'supermercado'],
    ['AHORRAMAS 123', 'supermercado'],
    ['ALDI MADRID', 'supermercado'],
    ['CONDIS GOYA', 'supermercado'],
    ['METRO DE MADRID', 'transporte'],
    ['CRTM RECARGA', 'transporte'],
    ['BICIMAD', 'transporte'],
    ['CABIFY*TRIP', 'transporte'],
    ['UBER *TRIP', 'transporte'],
    ['UBER EATS', 'comida-fuera'], // la regla más específica gana a «UBER»
    ['GLOVO 12345', 'comida-fuera'],
    ['TELEPIZZA ARGUELLES', 'comida-fuera'],
    ['STARBUCKS SOL', 'comida-fuera'],
    ['BASIC FIT MADRID', 'deporte'],
    ['VIVAGYM CHAMBERI', 'deporte'],
    ['GO FIT', 'deporte'],
    ['PLAYTOMIC', 'deporte'],
    ['REPSOL E.S. 5133', 'gasolina'],
    ['PLENOIL ALCORCON', 'gasolina'],
    ['NETFLIX.COM', 'suscripciones'],
    ['SPOTIFY P1A2B3', 'suscripciones'],
    ['HBO MAX', 'suscripciones'],
    ['XBOX GAME PASS', 'suscripciones'], // gana a «XBOX» (Ocio) y «GAME» (Ocio)
    ['ZARA GRAN VIA', 'ropa'],
    ['H&M PRINCESA', 'ropa'],
    ['PULL&BEAR', 'ropa'],
    ['FARMACIA LDO PEREZ', 'salud'],
    ['IKEA SAN SEBASTIAN', 'hogar'],
    ['DIGI SPAIN TELECOM', 'hogar'],
    ['CASA DEL LIBRO', 'educacion'],
    ['UNIVERSIDAD COMPLUTENSE', 'educacion'],
    ['CINESA PROYECCIONES', 'ocio'],
    ['RYANAIR FR1234', 'viajes'],
    ['OUIGO ESPANA', 'viajes'],
  ])('%s → %s', (comercio, esperada) => {
    expect(categoria(comercio)).toBe(esperada)
  })

  it('palabras cortas o genéricas no confunden otros comercios', () => {
    expect(categoria('DIAMANTE JOYAS')).toBe('otros-gastos')
    expect(categoria('BARBERIA PACO')).toBe('otros-gastos')
    expect(categoria('GYMKANA SL')).toBe('otros-gastos')
    expect(categoria('BMW SERVICIO')).toBe('otros-gastos')
  })

  it('no hay reglas repetidas', () => {
    const textos = REGLAS_POR_DEFECTO.map((r) => r.contiene)
    expect(new Set(textos).size).toBe(textos.length)
  })
})

describe('puesta al día de datos antiguos', () => {
  const antiguo = (): EstadoApp => {
    const e = estadoInicial()
    return {
      ...e,
      categorias: e.categorias.filter((c) => c.id !== 'deporte'),
      migraciones: undefined,
      movimientos: [compra('BASIC FIT MADRID')],
    }
  }

  it('añade «Deporte» y reclasifica con las reglas nuevas', () => {
    const { estado, cambiado } = actualizarDatos(antiguo())
    expect(cambiado).toBe(true)
    expect(estado.categorias.some((c) => c.id === 'deporte')).toBe(true)
    expect(estado.movimientos[0]!.categoriaId).toBe('deporte')
    expect(estado.migraciones).toEqual(['categoria-deporte'])
  })

  it('no vuelve a crearla si el usuario la borra', () => {
    const una = actualizarDatos(antiguo()).estado
    const sinDeporte = { ...una, categorias: una.categorias.filter((c) => c.id !== 'deporte') }
    const otra = actualizarDatos(sinDeporte).estado
    expect(otra.categorias.some((c) => c.id === 'deporte')).toBe(false)
  })

  it('con datos al día no cambia nada', () => {
    const al = actualizarDatos(antiguo()).estado
    expect(actualizarDatos(al).cambiado).toBe(false)
  })

  it('respeta las categorías elegidas a mano', () => {
    const e = antiguo()
    e.movimientos = [{ ...compra('BASIC FIT MADRID'), categoriaId: 'ocio', categoriaManual: true }]
    expect(actualizarDatos(e).estado.movimientos[0]!.categoriaId).toBe('ocio')
  })
})

describe('series para las gráficas', () => {
  const m = (fecha: string, saldo: number): Movimiento => ({ ...compra('X', -100, fecha), saldo })

  it('saldo diario: rellena los días sin movimientos con el saldo anterior', () => {
    const s = serieSaldoDiaria([m('2026-11-28', 500), m('2026-11-28', 400), m('2026-12-02', 300)])
    expect(s).toEqual([
      { fecha: '2026-11-28', saldo: 400 },
      { fecha: '2026-11-29', saldo: 400 },
      { fecha: '2026-11-30', saldo: 400 },
      { fecha: '2026-12-01', saldo: 400 },
      { fecha: '2026-12-02', saldo: 300 },
    ])
    expect(serieSaldoDiaria([])).toEqual([])
  })

  it('meses con datos: no muestra meses anteriores al primer movimiento', () => {
    expect(mesesConDatos([m('2026-10-24', 1)], '2026-11', 12)).toEqual(['2026-10', '2026-11'])
    expect(mesesConDatos([m('2024-01-01', 1)], '2026-11', 12)).toHaveLength(12)
  })
})
