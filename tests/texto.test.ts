import { describe, expect, it } from 'vitest'
import { normalizar, palabras } from '../src/utilidades/texto'

describe('normalizar', () => {
  it('recorta, pone mayúsculas, quita tildes y une espacios', () => {
    expect(normalizar('  Lucía   Muñoz  ')).toBe('LUCIA MUNOZ')
    expect(normalizar('ENVIO BIZUM Andrés\tclases')).toBe('ENVIO BIZUM ANDRES CLASES')
  })

  it('quita los espacios de relleno del Excel', () => {
    expect(normalizar('COMPRA T.C. PANADERIA EL TRIGO       ')).toBe('COMPRA T.C. PANADERIA EL TRIGO')
  })
})

describe('palabras', () => {
  it('separa por palabra completa (ale no es Alejandro)', () => {
    expect(palabras('taxi ale')).toEqual(['TAXI', 'ALE'])
    expect(palabras('Alejandro')).not.toContain('ALE')
  })
})
