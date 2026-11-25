// Saldo con cada persona (§7):
//   saldo = deudas «me debe» − deudas «le debo» − pagos recibidos + pagos hechos
// Con Pago.importe positivo = la persona me paga y negativo = yo le pago:
//   saldo = Σ me_debe − Σ le_debo − Σ pago.importe
// saldo > 0 → «Te debe»; saldo < 0 → «Le debes»; 0 → al día.
// Pago de más: el signo cambia y se mantiene (Andres debe 40, paga 50 → le debes 10).

import type { Deuda, EstadoApp, Pago, Persona } from '../estado/tipos'

export function saldoPersona(estado: Pick<EstadoApp, 'deudas' | 'pagos'>, personaId: string): number {
  let saldo = 0
  for (const d of estado.deudas) {
    if (d.personaId !== personaId || d.eliminada) continue
    saldo += d.direccion === 'me_debe' ? d.importe : -d.importe
  }
  for (const p of estado.pagos) if (p.personaId === personaId) saldo -= p.importe
  return saldo
}

/** Saldo de todas las personas que tienen alguna deuda o pago. */
export function saldos(estado: Pick<EstadoApp, 'deudas' | 'pagos'>): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const d of estado.deudas) {
    if (d.eliminada) continue
    mapa.set(d.personaId, (mapa.get(d.personaId) ?? 0) + (d.direccion === 'me_debe' ? d.importe : -d.importe))
  }
  for (const p of estado.pagos) mapa.set(p.personaId, (mapa.get(p.personaId) ?? 0) - p.importe)
  return mapa
}

/** Personas con saldo distinto de cero, de mayor a menor importe (§10.2). */
export function personasConSaldo(estado: EstadoApp): { persona: Persona; saldo: number }[] {
  const mapa = saldos(estado)
  return estado.personas
    .map((persona) => ({ persona, saldo: mapa.get(persona.id) ?? 0 }))
    .filter((x) => x.saldo !== 0)
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
}

export type EntradaHistorial = { tipo: 'deuda'; deuda: Deuda } | { tipo: 'pago'; pago: Pago }

/** Deudas (no eliminadas) y pagos de una persona, del más reciente al más antiguo. */
export function historialPersona(estado: EstadoApp, personaId: string): EntradaHistorial[] {
  const entradas: (EntradaHistorial & { fecha: string })[] = [
    ...estado.deudas
      .filter((d) => d.personaId === personaId && !d.eliminada)
      .map((deuda) => ({ tipo: 'deuda' as const, deuda, fecha: deuda.fecha })),
    ...estado.pagos
      .filter((p) => p.personaId === personaId)
      .map((pago) => ({ tipo: 'pago' as const, pago, fecha: pago.fecha })),
  ]
  return entradas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
}
