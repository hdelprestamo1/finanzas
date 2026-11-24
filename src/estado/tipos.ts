// Modelo de datos (§7, especificación v3). Importes y saldos siempre en céntimos (enteros).
import { categoriasPorDefecto } from '../categorias/porDefecto'

export type TipoMovimiento =
  | 'tarjeta' // "COMPRA T.C. ..."
  | 'tarjeta_diferida' // compras sin prefijo (online, extranjero, suscripciones, viajes)
  | 'devolucion' // "DEVOLUCION T.P.V. ..."
  | 'bizum' // "ENVIO BIZUM ..." (dirección por el signo)
  | 'transferencia' // "TRANSF. ..." (enviada) / "OP.NET ..." (recibida)
  | 'otro' // prefijo desconocido con importe positivo

export interface Movimiento {
  id: string
  fecha: string // aaaa-mm-dd (fecha de operación; el extracto no trae hora)
  fechaValor: string
  importe: number // céntimos; positivo = entra, negativo = sale
  saldo: number // céntimos; saldo tras el movimiento (viene en el Excel)
  concepto: string // texto original, sin espacios finales
  tipo: TipoMovimiento
  comercio?: string
  /** Texto escrito por quien hizo el Bizum o la transferencia (null = texto por defecto). */
  textoLibre?: string | null
  nombreEnConcepto?: string
  personaId?: string
  categoriaId: string
  categoriaManual: boolean
  nota?: string
  importacionId: string
}

export interface Categoria {
  id: string
  nombre: string
  tipo: 'gasto' | 'ingreso' | 'ambos'
  color: string
  orden: number
}

export interface ReglaCategoria {
  id: string
  campo: 'comercio' | 'concepto'
  contiene: string
  categoriaId: string
  creadaPorUsuario: boolean
}

export interface Persona {
  id: string
  nombre: string
  telefonos: string[]
  /** Nombres, apodos o textos que suelen aparecer en sus Bizum/transferencias. */
  aliasTexto: string[]
  origen: 'vcf' | 'manual'
}

export interface Deuda {
  id: string
  personaId: string
  direccion: 'me_debe' | 'le_debo'
  importe: number
  concepto: string
  fecha: string
  eliminada: boolean
}

export interface Pago {
  id: string
  personaId: string
  movimientoId?: string
  importe: number // positivo = la persona me paga, negativo = yo le pago
  fecha: string
  manual: boolean
}

export interface Importacion {
  id: string
  fecha: string
  nombreArchivo: string
  periodoDesde: string
  periodoHasta: string
  saldoInicial: number
  saldoFinal: number
  filasLeidas: number
  filasNuevas: number
  filasDuplicadas: number
}

export interface Ajustes {
  /** Cómo aparece el usuario en los textos de Bizum; nunca se toma como contraparte. */
  miNombre: string[]
  /** Minutos de inactividad (o en segundo plano) antes de bloquear. */
  minutosBloqueo: number
}

/** Todo el estado de la app: se guarda como un único blob cifrado (§5.2). */
export interface EstadoApp {
  version: 1
  ajustes: Ajustes
  movimientos: Movimiento[]
  categorias: Categoria[]
  reglas: ReglaCategoria[]
  personas: Persona[]
  deudas: Deuda[]
  pagos: Pago[]
  importaciones: Importacion[]
  /** Fecha ISO de la última copia de seguridad exportada. */
  ultimaCopia?: string
}

export const MINUTOS_BLOQUEO_POR_DEFECTO = 5

export function estadoInicial(): EstadoApp {
  return {
    version: 1,
    ajustes: { miNombre: [], minutosBloqueo: MINUTOS_BLOQUEO_POR_DEFECTO },
    movimientos: [],
    categorias: categoriasPorDefecto(),
    reglas: [],
    personas: [],
    deudas: [],
    pagos: [],
    importaciones: [],
  }
}
