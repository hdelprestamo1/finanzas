import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerHoja } from '../src/importador/leerHoja'
import { parsearFilasKutxabank } from '../src/importador/kutxabank'
import { preverImportacion, type PrevisionImportacion } from '../src/importador/fusionar'
import { contienePalabras, reclasificar, textoParaRegla } from '../src/categorias/clasificar'
import {
  borrarCategoria,
  borrarRegla,
  cambiarCategoriaMovimiento,
  cambiarNota,
  categoriasPropuestas,
  crearCategoria,
  crearReglaComercio,
  importarExtracto,
  restablecerCategoriaAutomatica,
} from '../src/categorias/operaciones'
import { estadoInicial, type EstadoApp, type Movimiento } from '../src/estado/tipos'

let prevision: PrevisionImportacion
let base: EstadoApp

beforeAll(async () => {
  const b = readFileSync(new URL('./fixtures/extracto-ejemplo.xls', import.meta.url))
  const extracto = parsearFilasKutxabank(
    await leerHoja(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'x.xls'),
  )
  prevision = preverImportacion(extracto, [])
  base = importarExtracto(estadoInicial(), prevision, {
    importacionId: 'imp',
    nombreArchivo: 'x.xls',
    fecha: '2026-03-10',
  })
})

const cat = (e: EstadoApp, concepto: string) =>
  e.movimientos.find((m) => m.concepto === concepto)!.categoriaId
const mov = (e: EstadoApp, concepto: string) => e.movimientos.find((m) => m.concepto === concepto)!

/** Movimiento mínimo de tarjeta para casos sueltos. */
function compra(comercio: string, importe = -1000, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id: comercio + importe,
    fecha: '2026-01-01',
    fechaValor: '2026-01-01',
    importe,
    saldo: 0,
    concepto: 'COMPRA T.C. ' + comercio,
    tipo: 'tarjeta',
    comercio,
    categoriaId: 'otros-gastos',
    categoriaManual: false,
    importacionId: 'x',
    ...extra,
  }
}
const clasifica = (m: Movimiento[]) => reclasificar(m, [], estadoInicial().categorias)

describe('palabras completas', () => {
  it('casa palabras seguidas y completas', () => {
    expect(contienePalabras('MERCADONA GRAL MARTINEZ C', 'MERCADONA')).toBe(true)
    expect(contienePalabras('BURGER KING 123', 'BURGER KING')).toBe(true)
    expect(contienePalabras('APPLE.COM/BILL', 'APPLE.COM/BILL')).toBe(true)
  })

  it('no confunde palabras cortas con trozos de otras', () => {
    expect(contienePalabras('DIAMANTE JOYAS', 'DIA')).toBe(false)
    expect(contienePalabras('BMW SERVICIO', 'BM')).toBe(false)
    expect(contienePalabras('BARBERIA PACO', 'BAR')).toBe(false)
    expect(contienePalabras('BAR PACO', 'BAR')).toBe(true)
    expect(contienePalabras('KING BURGER', 'BURGER KING')).toBe(false)
  })
})

describe('reglas por defecto', () => {
  it('clasifica por comercio', () => {
    const r = clasifica([
      compra('MERCADONA GRAL MARTINEZ C'),
      compra('DIA 1234'),
      compra('REPSOL E.S. 22'),
      compra('RYANAIR   FR123'),
      compra('SPOTIFY AB'),
      compra('BURGER KING 5'),
      compra('RENFE VIAJEROS'),
      compra('TIENDA DE ROPA'),
    ])
    expect(r.map((m) => m.categoriaId)).toEqual([
      'supermercado',
      'supermercado',
      'gasolina',
      'viajes',
      'suscripciones',
      'comida-fuera',
      'transporte',
      'otros-gastos',
    ])
  })

  it('sin regla: otros gastos u otros ingresos según el signo', () => {
    const r = clasifica([compra('NADA', -100), { ...compra('X', 500), tipo: 'otro', comercio: undefined }])
    expect(r.map((m) => m.categoriaId)).toEqual(['otros-gastos', 'otros-ingresos'])
  })
})

describe('extracto de ejemplo', () => {
  it('aplica reglas por defecto, Bizum, transferencias y devoluciones', () => {
    expect(cat(base, 'MOVILIDAD EJEMPLO')).toBe('transporte')
    expect(cat(base, 'COMPRA T.C. TREN CERCANIAS TNA 05')).toBe('transporte')
    // La devolución hereda la categoría de la compra del mismo comercio.
    expect(cat(base, 'DEVOLUCION T.P.V. TREN CERCANIAS TNA 05')).toBe('transporte')
    expect(cat(base, 'ENVIO BIZUM Lucia')).toBe('bizum-recibido')
    expect(cat(base, 'ENVIO BIZUM cena viernes')).toBe('bizum-enviado')
    expect(cat(base, 'OP.NET pepe')).toBe('transferencias-recibidas')
    expect(cat(base, 'TRANSF. 0000')).toBe('transferencias-enviadas')
    expect(cat(base, 'COMPRA T.C. PANADERIA EL TRIGO')).toBe('otros-gastos')
  })

  it('la vista previa propone las mismas categorías que la importación', () => {
    const propuestas = categoriasPropuestas(estadoInicial(), prevision)
    for (const m of base.movimientos) expect(propuestas.get(m.id)).toBe(m.categoriaId)
  })

  it('devolución sin compra previa del comercio → Devoluciones', () => {
    const r = clasifica([
      { ...compra('TIENDA RARA', 500), tipo: 'devolucion', concepto: 'DEVOLUCION T.P.V. TIENDA RARA' },
    ])
    expect(r[0]!.categoriaId).toBe('devoluciones')
  })
})

describe('cambio manual y «aplicar a todos»', () => {
  it('el cambio manual se respeta y nunca se reclasifica', () => {
    const e1 = cambiarCategoriaMovimiento(base, mov(base, 'COMPRA T.C. PANADERIA EL TRIGO').id, 'comida-fuera')
    expect(mov(e1, 'COMPRA T.C. PANADERIA EL TRIGO')).toMatchObject({
      categoriaId: 'comida-fuera',
      categoriaManual: true,
    })
    // Una regla posterior que diría otra cosa no lo toca.
    const e2 = crearReglaComercio(e1, 'PANADERIA', 'supermercado')
    expect(cat(e2, 'COMPRA T.C. PANADERIA EL TRIGO')).toBe('comida-fuera')
  })

  it('una regla de usuario reclasifica todos los no manuales del comercio', () => {
    const manual = mov(base, 'COMPRA T.C. TREN CERCANIAS TNA 05').id
    const e1 = cambiarCategoriaMovimiento(base, manual, 'viajes')
    const e2 = crearReglaComercio(e1, 'TREN CERCANIAS', 'ocio')
    const tren = e2.movimientos.filter((m) => m.comercio === 'TREN CERCANIAS TNA 05')
    // 3 compras + 1 devolución; la editada a mano sigue en viajes.
    expect(tren.map((m) => m.categoriaId).sort()).toEqual(['ocio', 'ocio', 'ocio', 'viajes'])
  })

  it('las reglas de usuario van antes que las de defecto', () => {
    const e = crearReglaComercio(base, 'movilidad ejemplo', 'ocio')
    expect(cat(e, 'MOVILIDAD EJEMPLO')).toBe('ocio')
    expect(e.reglas[0]).toMatchObject({ contiene: 'MOVILIDAD EJEMPLO', creadaPorUsuario: true })
  })

  it('una regla de usuario también puede aplicarse a un Bizum por su concepto', () => {
    const e: EstadoApp = {
      ...base,
      reglas: [
        { id: 'r', campo: 'concepto', contiene: 'CENA', categoriaId: 'comida-fuera', creadaPorUsuario: true },
      ],
    }
    const r = reclasificar(e.movimientos, e.reglas, e.categorias)
    expect(r.find((m) => m.concepto === 'ENVIO BIZUM cena viernes')!.categoriaId).toBe('comida-fuera')
  })

  it('crear otra regla con el mismo texto la sustituye', () => {
    const e1 = crearReglaComercio(base, 'TREN CERCANIAS', 'ocio')
    const e2 = crearReglaComercio(e1, 'tren cercanías', 'viajes')
    expect(e2.reglas).toHaveLength(1)
    expect(cat(e2, 'COMPRA T.C. TREN CERCANIAS TNA 05')).toBe('viajes')
  })

  it('borrar la regla vuelve a la clasificación por defecto', () => {
    const e1 = crearReglaComercio(base, 'TREN CERCANIAS', 'ocio')
    const e2 = borrarRegla(e1, e1.reglas[0]!.id)
    expect(cat(e2, 'COMPRA T.C. TREN CERCANIAS TNA 05')).toBe('transporte')
  })

  it('restablecer la categoría automática', () => {
    const id = mov(base, 'MOVILIDAD EJEMPLO').id
    const e1 = cambiarCategoriaMovimiento(base, id, 'ocio')
    const e2 = restablecerCategoriaAutomatica(e1, id)
    expect(mov(e2, 'MOVILIDAD EJEMPLO')).toMatchObject({ categoriaId: 'transporte', categoriaManual: false })
  })

  it('texto propuesto para la regla sin códigos finales', () => {
    expect(textoParaRegla('SUPER EJEMPLO 5350')).toBe('SUPER EJEMPLO')
    expect(textoParaRegla('SUPER EJEMPLO 4665')).toBe('SUPER EJEMPLO')
    expect(textoParaRegla('AEROLINEA DEMO   ABC123XYZ')).toBe('AEROLINEA DEMO')
    expect(textoParaRegla('Streaming M1234ABCD')).toBe('STREAMING')
    expect(textoParaRegla('APP TAXI   *TRIP')).toBe('APP TAXI *TRIP')
    expect(textoParaRegla('12345')).toBe('12345')
  })

  it('nota: se guarda recortada y se borra si queda vacía', () => {
    const id = mov(base, 'MOVILIDAD EJEMPLO').id
    const e1 = cambiarNota(base, id, '  patinete  ')
    expect(mov(e1, 'MOVILIDAD EJEMPLO').nota).toBe('patinete')
    expect('nota' in mov(cambiarNota(e1, id, '   '), 'MOVILIDAD EJEMPLO')).toBe(false)
  })
})

describe('categorías', () => {
  it('crear una categoría nueva', () => {
    const e = crearCategoria(base, { nombre: ' Mascotas ', tipo: 'gasto', color: '#123456' })
    expect(e.categorias.at(-1)).toMatchObject({ nombre: 'Mascotas', tipo: 'gasto' })
  })

  it('borrar una categoría mueve sus movimientos y reglas a la de destino', () => {
    const e1 = crearReglaComercio(base, 'PANADERIA', 'supermercado')
    const e2 = borrarCategoria(e1, 'transporte', 'ocio')
    expect(e2.categorias.some((c) => c.id === 'transporte')).toBe(false)
    expect(cat(e2, 'MOVILIDAD EJEMPLO')).toBe('ocio')
    expect(mov(e2, 'MOVILIDAD EJEMPLO').categoriaManual).toBe(true)
    // Y una regla que apuntaba a la borrada pasa al destino.
    const e3 = borrarCategoria(e2, 'supermercado', 'comida-fuera')
    expect(e3.reglas[0]!.categoriaId).toBe('comida-fuera')
    expect(cat(e3, 'COMPRA T.C. PANADERIA EL TRIGO')).toBe('comida-fuera')
  })

  it('las reglas por defecto de una categoría borrada se ignoran', () => {
    const e = borrarCategoria(base, 'gasolina', 'otros-gastos')
    const r = reclasificar([compra('REPSOL 1')], e.reglas, e.categorias)
    expect(r[0]!.categoriaId).toBe('otros-gastos')
  })

  it('no deja borrar las categorías que usa la app', () => {
    expect(() => borrarCategoria(base, 'bizum-enviado', 'otros-gastos')).toThrow()
    expect(() => borrarCategoria(base, 'otros-gastos', 'ocio')).toThrow()
  })
})
