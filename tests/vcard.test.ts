import { describe, expect, it } from 'vitest'
import { claveTelefono, leerVcard } from '../src/personas/vcard'
import { buscarPersonas, importarContactos } from '../src/personas/operaciones'
import { estadoInicial } from '../src/estado/tipos'

// Contactos INVENTADOS.
const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:García López;Andrés;;;',
  'FN:Andrés García',
  'TEL;type=CELL;type=VOICE;type=pref:+34 600 11 22 33',
  'TEL;type=HOME:91 123 45 67',
  'EMAIL;type=INTERNET:andres@ejemplo.test',
  'ADR;type=HOME:;;Calle Falsa 1;Ciudad;;00000;España',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Pérez;Lucía;;;',
  'TEL;type=CELL:600-44-55-66',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=4A=6F=72=67=65;;;',
  'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4A=6F=72=67=65 =4D=75=C3=B1=6F=7A',
  'TEL;CELL:600778899',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Nombre muy largo que conti',
  ' núa en otra línea',
  'item1.TEL:+34 611 000 111',
  'END:VCARD',
].join('\r\n')

describe('leerVcard', () => {
  const contactos = leerVcard(VCF)

  it('lee nombre (FN, o N si no hay FN) y teléfonos', () => {
    expect(contactos).toEqual([
      { nombre: 'Andrés García', telefonos: ['+34600112233', '911234567'] },
      { nombre: 'Lucía Pérez', telefonos: ['600445566'] },
      { nombre: 'Jorge Muñoz', telefonos: ['600778899'] },
      { nombre: 'Nombre muy largo que continúa en otra línea', telefonos: ['+34611000111'] },
    ])
  })

  it('no guarda correo ni dirección', () => {
    const texto = JSON.stringify(contactos)
    expect(texto).not.toContain('andres@')
    expect(texto).not.toContain('Calle Falsa')
  })

  it('clave de teléfono: ignora el prefijo +34', () => {
    expect(claveTelefono('+34600112233')).toBe(claveTelefono('600 11 22 33'))
  })
})

describe('importarContactos', () => {
  it('reimportar fusiona por teléfono o nombre sin duplicar', () => {
    const primera = importarContactos(estadoInicial(), leerVcard(VCF))
    expect(primera.nuevos).toBe(4)
    const segunda = importarContactos(primera.estado, [
      { nombre: 'Andrés G.', telefonos: ['600112233'] }, // mismo teléfono sin +34
      { nombre: 'lucia perez', telefonos: ['622000000'] }, // mismo nombre, teléfono nuevo
      { nombre: 'Nueva Persona', telefonos: [] },
    ])
    expect(segunda.nuevos).toBe(1)
    expect(segunda.actualizados).toBe(1)
    expect(segunda.estado.personas).toHaveLength(5)
    const lucia = segunda.estado.personas.find((p) => p.nombre === 'Lucía Pérez')!
    expect(lucia.telefonos).toEqual(['600445566', '622000000'])
    // El nombre de una persona existente no se cambia.
    expect(segunda.estado.personas.some((p) => p.nombre === 'Andrés G.')).toBe(false)
  })

  it('búsqueda rápida sin tildes, por inicio de palabra o por teléfono', () => {
    const { estado } = importarContactos(estadoInicial(), leerVcard(VCF))
    expect(buscarPersonas(estado.personas, 'andres').map((p) => p.nombre)).toEqual(['Andrés García'])
    expect(buscarPersonas(estado.personas, 'perez').map((p) => p.nombre)).toEqual(['Lucía Pérez'])
    expect(buscarPersonas(estado.personas, '778').map((p) => p.nombre)).toEqual(['Jorge Muñoz'])
    expect(buscarPersonas(estado.personas, '')).toEqual([])
  })
})
