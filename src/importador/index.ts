// Punto de entrada del importador. Interfaz común de "fuente de movimientos"
// (§15) para poder añadir otras fuentes en el futuro sin tocar las pantallas.

import { leerHoja } from './leerHoja'
import { parsearFilasKutxabank, type ExtractoLeido } from './kutxabank'

export interface FuenteMovimientos {
  nombre: string
  /** Valor para el atributo `accept` del selector de archivos. */
  extensiones: string
  leer(datos: ArrayBuffer, nombreArchivo: string): Promise<ExtractoLeido>
}

export const kutxabankExcel: FuenteMovimientos = {
  nombre: 'Kutxabank (Excel)',
  extensiones: '.xls,.xlsx,.csv',
  async leer(datos, nombreArchivo) {
    return parsearFilasKutxabank(await leerHoja(datos, nombreArchivo))
  },
}

export { ErrorImportacion } from './kutxabank'
export type { ExtractoLeido, MovimientoLeido } from './kutxabank'
export { preverImportacion, aplicarImportacion } from './fusionar'
export type { PrevisionImportacion, FilaPrevia } from './fusionar'
