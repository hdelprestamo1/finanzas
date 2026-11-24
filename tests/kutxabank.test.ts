import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerHoja, type Fila } from '../src/importador/leerHoja'
import {
  ErrorImportacion,
  clasificar,
  leerCentimos,
  leerFecha,
  parsearFilasKutxabank,
  type ExtractoLeido,
} from '../src/importador/kutxabank'

const RUTA_FIXTURE = new URL('./fixtures/extracto-ejemplo.xls', import.meta.url)

async function leerFixture(): Promise<Fila[]> {
  const buffer = readFileSync(RUTA_FIXTURE)
  const datos = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return leerHoja(datos, 'extracto-ejemplo.xls')
}

describe('extracto-ejemplo.xls (Apéndice A)', () => {
  let filas: Fila[]
  let extracto: ExtractoLeido

  beforeAll(async () => {
    filas = await leerFixture()
    extracto = parsearFilasKutxabank(filas)
  })

  it('lee las filas desde A1 aunque el rango declarado empiece en A5', () => {
    expect(filas[4]?.[0]).toBe('Movimientos de cuenta')
    expect(filas[6]).toEqual(['fecha', 'concepto', 'fecha valor', 'importe', 'saldo'])
  })

  it('24 movimientos, saldo inicial 150,00 y final 409,23', () => {
    expect(extracto.movimientos).toHaveLength(24)
    expect(extracto.saldoInicial).toBe(15000)
    expect(extracto.saldoFinal).toBe(40923)
    expect(extracto.periodoDesde).toBe('2026-03-02')
    expect(extracto.periodoHasta).toBe('2026-03-09')
  })

  it('los datos empiezan en la fila 9 de la hoja', () => {
    expect(extracto.movimientos[0]?.fila).toBe(9)
  })

  it('todas las filas cuadran (saldo anterior + importe = saldo)', () => {
    const m = extracto.movimientos
    for (let i = 1; i < m.length; i++) expect(m[i - 1]!.saldo + m[i]!.importe).toBe(m[i]!.saldo)
  })

  it('cuenta los tipos', () => {
    const cuenta: Record<string, number> = {}
    for (const m of extracto.movimientos) cuenta[m.tipo] = (cuenta[m.tipo] ?? 0) + 1
    expect(cuenta).toEqual({
      tarjeta: 6,
      devolucion: 1,
      bizum: 10,
      transferencia: 2,
      tarjeta_diferida: 5,
    })
    expect(extracto.movimientos.every((m) => m.reconocido)).toBe(true)
  })

  it('las compras sin prefijo son tarjeta_diferida', () => {
    const diferidas = extracto.movimientos
      .filter((m) => m.tipo === 'tarjeta_diferida')
      .map((m) => m.comercio)
    expect(diferidas).toEqual([
      'MOVILIDAD EJEMPLO',
      'AEROLINEA DEMO   ABC123XYZ',
      'APP TAXI   *TRIP',
      'Streaming M1234ABCD',
      'TIENDA EXTRANJERA 4021',
    ])
  })

  it('Bizum: nombre en el concepto, textos por defecto y texto libre', () => {
    const porConcepto = (c: string) => extracto.movimientos.find((m) => m.concepto === c)!
    expect(porConcepto('ENVIO BIZUM Bizum de Jorge').nombreEnConcepto).toBe('JORGE')
    expect(porConcepto('ENVIO BIZUM Bizum de JORGE').nombreEnConcepto).toBe('JORGE')
    expect(porConcepto('ENVIO BIZUM Envio de dinero con Bizum').textoLibre).toBeNull()
    expect(porConcepto('ENVIO BIZUM Sin concepto').textoLibre).toBeNull()
    expect(porConcepto('ENVIO BIZUM Lucia').textoLibre).toBe('Lucia')
    expect(porConcepto('OP.NET pepe').textoLibre).toBe('pepe')
    expect(porConcepto('TRANSF. 0000').tipo).toBe('transferencia')
  })

  it('MOVILIDAD EJEMPLO: fecha 2026-03-02, fecha valor 2026-02-28', () => {
    const m = extracto.movimientos.find((x) => x.concepto === 'MOVILIDAD EJEMPLO')!
    expect(m.fecha).toBe('2026-03-02')
    expect(m.fechaValor).toBe('2026-02-28')
    expect(m.importe).toBe(-75)
  })

  it('devuelve los conceptos sin espacios finales', () => {
    for (const m of extracto.movimientos) expect(m.concepto).toBe(m.concepto.trim())
    expect(extracto.movimientos[2]?.concepto).toBe('COMPRA T.C. PANADERIA EL TRIGO')
  })

  it('el concepto truncado se conserva tal cual', () => {
    expect(extracto.movimientos[4]?.comercio).toBe('SUPERMERCADO EJEMPLO CENTR')
  })
})

// --- Casos límite con filas construidas a mano -------------------------------

const CAB: Fila = ['fecha', 'concepto', 'fecha valor', 'importe', 'saldo']
const f = (fecha: string, concepto: string, importe: number, saldo: number): Fila => [
  fecha,
  concepto,
  fecha,
  importe,
  saldo,
]

describe('parsearFilasKutxabank: casos límite', () => {
  it('encuentra la cabecera en otra fila y con otras mayúsculas/tildes', () => {
    const filas: Fila[] = [
      [null],
      ['Fecha', 'Concepto', 'Fecha Valor', 'Importe', 'Saldo'],
      f('01/01/2026', 'COMPRA T.C. X', -1, 99),
    ]
    expect(parsearFilasKutxabank(filas).movimientos).toHaveLength(1)
  })

  it('acepta las columnas en otro orden', () => {
    const filas: Fila[] = [
      ['saldo', 'importe', 'concepto', 'fecha', 'fecha valor'],
      [99, -1, 'COMPRA T.C. X', '01/01/2026', '01/01/2026'],
    ]
    const m = parsearFilasKutxabank(filas).movimientos[0]!
    expect(m).toMatchObject({ saldo: 9900, importe: -100, concepto: 'COMPRA T.C. X' })
  })

  it('ignora filas vacías antes de los datos y para en la primera vacía después', () => {
    const filas: Fila[] = [
      CAB,
      [null, null, null, null, null],
      f('01/01/2026', 'COMPRA T.C. A', -1, 99),
      f('02/01/2026', 'COMPRA T.C. B', -1, 98),
      [null, null, null, null, null],
      ['', '   ', null, null, null],
      f('03/01/2026', 'BASURA TRAS HUECO', -1, 50),
    ]
    expect(parsearFilasKutxabank(filas).movimientos).toHaveLength(2)
  })

  it('error claro si no hay cabeceras', () => {
    expect(() => parsearFilasKutxabank([['hola'], ['adios']])).toThrow(ErrorImportacion)
    expect(() => parsearFilasKutxabank([['hola']])).toThrow(/no parece un extracto de Kutxabank/)
  })

  it('error si no hay movimientos', () => {
    expect(() => parsearFilasKutxabank([CAB, [null]])).toThrow(/no contiene movimientos/)
  })

  it('error con el número de fila si el saldo no cuadra', () => {
    const filas: Fila[] = [
      CAB,
      f('01/01/2026', 'COMPRA T.C. A', -1, 99),
      f('02/01/2026', 'COMPRA T.C. B', -1, 97), // debería ser 98
    ]
    expect(() => parsearFilasKutxabank(filas)).toThrow(/fila 3/)
  })

  it('error si una fecha no se entiende', () => {
    expect(() => parsearFilasKutxabank([CAB, ['31/02/2026', 'X', '31/02/2026', -1, 1]])).toThrow(
      /fecha de la fila 2/,
    )
  })

  it('acepta importes como texto (CSV) con coma decimal y miles', () => {
    const filas: Fila[] = [
      CAB,
      ['01/01/2026', 'OP.NET nomina', '01/01/2026', '1.234,56', '2.234,56'],
      ['02/01/2026', 'COMPRA T.C. X', '02/01/2026', '-0,75', '2.233,81'],
    ]
    const e = parsearFilasKutxabank(filas)
    expect(e.movimientos.map((m) => m.importe)).toEqual([123456, -75])
    expect(e.saldoInicial).toBe(100000)
  })

  it('evita errores de coma flotante (Math.round)', () => {
    const filas: Fila[] = [CAB, f('01/01/2026', 'COMPRA T.C. X', -0.1 - 0.2, 0.7)]
    expect(parsearFilasKutxabank(filas).movimientos[0]!.importe).toBe(-30)
  })
})

describe('utilidades del parser', () => {
  it('leerFecha', () => {
    expect(leerFecha('02/03/2026')).toBe('2026-03-02')
    expect(leerFecha('2/3/26')).toBe('2026-03-02')
    expect(leerFecha(46083)).toBe('2026-03-02') // número de serie de Excel
    expect(leerFecha('2026-03-02')).toBeNull()
    expect(leerFecha(null)).toBeNull()
  })

  it('leerCentimos', () => {
    expect(leerCentimos(-18.35)).toBe(-1835)
    expect(leerCentimos('-18,35')).toBe(-1835)
    expect(leerCentimos('1.234')).toBe(123400)
    expect(leerCentimos('12,5 €')).toBe(1250)
    expect(leerCentimos('abc')).toBeNull()
    expect(leerCentimos(null)).toBeNull()
  })

  it('clasificar: prefijo desconocido con importe positivo → otro, no reconocido', () => {
    expect(clasificar('ABONO RARO', 500)).toEqual({ tipo: 'otro', reconocido: false })
  })

  it('clasificar: Bizum sin texto', () => {
    expect(clasificar('ENVIO BIZUM', 500)).toMatchObject({ tipo: 'bizum', textoLibre: null })
  })
})
