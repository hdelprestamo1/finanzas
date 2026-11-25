// Lector propio de vCard (.vcf) (§10.1). Solo extrae nombre y teléfonos;
// el resto del contacto (correo, dirección, foto...) se ignora y nunca se guarda.

export interface ContactoLeido {
  nombre: string
  telefonos: string[]
}

/** Lee un archivo .vcf (una o varias tarjetas). */
export function leerVcard(texto: string): ContactoLeido[] {
  // "Desplegar" líneas: una línea que empieza por espacio o tabulador continúa la anterior.
  // En quoted-printable, un "=" final también continúa en la línea siguiente.
  const crudas = texto.replace(/\r\n?/g, '\n').split('\n')
  const lineas: string[] = []
  for (const l of crudas) {
    const anterior = lineas[lineas.length - 1]
    if ((l.startsWith(' ') || l.startsWith('\t')) && anterior !== undefined) {
      lineas[lineas.length - 1] = anterior + l.slice(1)
    } else if (anterior !== undefined && /QUOTED-PRINTABLE/i.test(anterior) && anterior.endsWith('=')) {
      lineas[lineas.length - 1] = anterior.slice(0, -1) + l
    } else {
      lineas.push(l)
    }
  }

  const contactos: ContactoLeido[] = []
  let fn = ''
  let n = ''
  let telefonos: string[] = []
  let dentro = false

  for (const linea of lineas) {
    const dosPuntos = linea.indexOf(':')
    if (dosPuntos < 0) continue
    const cabecera = linea.slice(0, dosPuntos)
    const valor = linea.slice(dosPuntos + 1)
    const [propiedadConGrupo, ...parametros] = cabecera.split(';')
    const propiedad = (propiedadConGrupo ?? '').split('.').pop()!.toUpperCase()

    if (propiedad === 'BEGIN' && valor.trim().toUpperCase() === 'VCARD') {
      dentro = true
      fn = ''
      n = ''
      telefonos = []
      continue
    }
    if (!dentro) continue
    if (propiedad === 'END' && valor.trim().toUpperCase() === 'VCARD') {
      dentro = false
      const nombre = (fn || nombreDesdeN(n)).trim()
      if (nombre || telefonos.length) {
        contactos.push({ nombre: nombre || telefonos[0]!, telefonos: [...new Set(telefonos)] })
      }
      continue
    }

    const decodificado = decodificar(valor, parametros)
    if (propiedad === 'FN') fn = desescapar(decodificado)
    else if (propiedad === 'N') n = decodificado
    else if (propiedad === 'TEL') {
      const tel = limpiarTelefono(decodificado.replace(/^tel:/i, ''))
      if (tel) telefonos.push(tel)
    }
  }
  return contactos
}

/** N = Apellidos;Nombre;Segundo nombre;Prefijo;Sufijo → "Nombre Apellidos". */
function nombreDesdeN(n: string): string {
  const partes = dividir(n).map(desescapar)
  const [apellidos = '', nombre = '', segundo = ''] = partes
  return [nombre, segundo, apellidos].filter(Boolean).join(' ')
}

/** Divide por ";" respetando "\;". */
function dividir(valor: string): string[] {
  const partes: string[] = []
  let actual = ''
  for (let i = 0; i < valor.length; i++) {
    const c = valor[i]!
    if (c === '\\' && i + 1 < valor.length) {
      actual += c + valor[i + 1]
      i++
    } else if (c === ';') {
      partes.push(actual)
      actual = ''
    } else actual += c
  }
  partes.push(actual)
  return partes
}

function desescapar(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c)).trim()
}

function decodificar(valor: string, parametros: string[]): string {
  const qp = parametros.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p) || /^QUOTED-PRINTABLE$/i.test(p))
  if (!qp) return valor
  const bytes: number[] = []
  for (let i = 0; i < valor.length; i++) {
    if (valor[i] === '=' && /^[0-9A-F]{2}$/i.test(valor.slice(i + 1, i + 3))) {
      bytes.push(parseInt(valor.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(valor.charCodeAt(i))
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

/** Deja solo dígitos y un "+" inicial. */
export function limpiarTelefono(tel: string): string {
  const t = tel.trim()
  const digitos = t.replace(/\D/g, '')
  if (!digitos) return ''
  return (t.startsWith('+') ? '+' : '') + digitos
}

/** Para comparar teléfonos: últimos 9 dígitos (ignora +34, 0034...). */
export function claveTelefono(tel: string): string {
  return tel.replace(/\D/g, '').slice(-9)
}
