// Deudas y pagos (§10.2, §10.3). Funciones puras EstadoApp → EstadoApp.
import type { Deuda, EstadoApp, Pago } from '../estado/tipos'
import { agregarAlias } from '../personas/operaciones'
import { saldoPersona } from './saldos'

export function crearDeuda(
  estado: EstadoApp,
  datos: Pick<Deuda, 'personaId' | 'direccion' | 'importe' | 'concepto' | 'fecha'>,
): EstadoApp {
  if (!Number.isInteger(datos.importe) || datos.importe <= 0) throw new Error('Importe no válido')
  const deuda: Deuda = { id: crypto.randomUUID(), ...datos, concepto: datos.concepto.trim(), eliminada: false }
  return { ...estado, deudas: [...estado.deudas, deuda] }
}

/** Eliminar a mano (con confirmación en la interfaz). Se marca, no se borra del historial interno. */
export function eliminarDeuda(estado: EstadoApp, deudaId: string): EstadoApp {
  return { ...estado, deudas: estado.deudas.map((d) => (d.id === deudaId ? { ...d, eliminada: true } : d)) }
}

/** Elimina un pago; si venía de un movimiento, el movimiento queda sin asignar. */
export function eliminarPago(estado: EstadoApp, pagoId: string): EstadoApp {
  const pago = estado.pagos.find((p) => p.id === pagoId)
  if (!pago) return estado
  return {
    ...estado,
    pagos: estado.pagos.filter((p) => p.id !== pagoId),
    movimientos: pago.movimientoId
      ? estado.movimientos.map((m) => (m.id === pago.movimientoId ? sinPersona(m) : m))
      : estado.movimientos,
  }
}

/** «Marcar como saldada»: pago manual por el importe pendiente, sea cual sea el signo. */
export function marcarSaldada(estado: EstadoApp, personaId: string, fecha: string): EstadoApp {
  const saldo = saldoPersona(estado, personaId)
  if (saldo === 0) return estado
  const pago: Pago = { id: crypto.randomUUID(), personaId, importe: saldo, fecha, manual: true }
  return { ...estado, pagos: [...estado.pagos, pago] }
}

/**
 * Asigna un movimiento del banco a una persona creando un Pago vinculado
 * (un movimiento solo puede estar vinculado a un pago: si ya lo estaba, se sustituye).
 * Opcionalmente recuerda `alias` («'[texto]' es de [persona]»).
 */
export function asignarMovimiento(
  estado: EstadoApp,
  movimientoId: string,
  personaId: string,
  alias?: string,
): EstadoApp {
  const m = estado.movimientos.find((x) => x.id === movimientoId)
  if (!m) return estado
  const pago: Pago = {
    id: crypto.randomUUID(),
    personaId,
    movimientoId,
    importe: m.importe, // + me paga (recibido), − le pago (enviado)
    fecha: m.fecha,
    manual: false,
  }
  let nuevo: EstadoApp = {
    ...estado,
    pagos: [...estado.pagos.filter((p) => p.movimientoId !== movimientoId), pago],
    movimientos: estado.movimientos.map((x) => (x.id === movimientoId ? { ...x, personaId } : x)),
    descartados: (estado.descartados ?? []).filter((id) => id !== movimientoId),
  }
  if (alias) nuevo = agregarAlias(nuevo, personaId, alias)
  return nuevo
}

/** Quita la asignación de un movimiento (y su pago). */
export function desasignarMovimiento(estado: EstadoApp, movimientoId: string): EstadoApp {
  return {
    ...estado,
    pagos: estado.pagos.filter((p) => p.movimientoId !== movimientoId),
    movimientos: estado.movimientos.map((m) => (m.id === movimientoId ? sinPersona(m) : m)),
  }
}

/** «No» en una pregunta, o «Descartar» en Bizum sin asignar: no volver a preguntar. */
export function descartarMovimiento(estado: EstadoApp, movimientoId: string): EstadoApp {
  const descartados = estado.descartados ?? []
  if (descartados.includes(movimientoId)) return estado
  return { ...estado, descartados: [...descartados, movimientoId] }
}

function sinPersona<T extends { personaId?: string }>(m: T): T {
  const { personaId: _quitado, ...resto } = m
  return resto as T
}
