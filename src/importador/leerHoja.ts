// Archivo (.xls, .xlsx o .csv) → filas de celdas en bruto (§8.2).
// SheetJS se carga bajo demanda: solo se descarga del caché al importar.

export type Celda = string | number | boolean | null
export type Fila = Celda[]

/**
 * Devuelve todas las filas de la primera hoja empezando SIEMPRE en A1
 * (el rango declarado del Excel de Kutxabank empieza en A5 y acaba mucho
 * más abajo: no se usa). Índice 0 = fila 1 de la hoja.
 */
export async function leerHoja(datos: ArrayBuffer, nombreArchivo: string): Promise<Fila[]> {
  const XLSX = await import('xlsx')
  const esCsv = /\.csv$/i.test(nombreArchivo)
  const libro = XLSX.read(new Uint8Array(datos), {
    type: 'array',
    // En CSV, raw evita que SheetJS convierta "02/03/2026" en fecha o "45,00" en otra cosa.
    raw: esCsv,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  })
  const hoja = libro.Sheets[libro.SheetNames[0] ?? '']
  if (!hoja || !hoja['!ref']) return []

  const rango = XLSX.utils.decode_range(hoja['!ref'])
  rango.s.r = 0
  rango.s.c = 0
  return XLSX.utils.sheet_to_json<Fila>(hoja, {
    header: 1,
    raw: true, // valor bruto: importes como número, no como texto formateado
    defval: null,
    blankrows: true,
    range: rango,
  })
}
