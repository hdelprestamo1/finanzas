// Orden de los movimientos guardados.
//
// El extracto no trae hora, pero sí el saldo tras cada movimiento: dentro de un mismo
// día, el orden real es el que encadena los saldos (saldo anterior + importe = saldo).
// Al juntar extractos que se solapan, un día puede quedar con movimientos de dos
// archivos; aquí se reordenan siguiendo esa cadena para que el orden sea el del banco.

export interface ConSaldo {
  fecha: string
  importe: number
  saldo: number
}

const LIMITE_PASOS = 20_000 // tope de búsqueda por día (los días tienen pocas filas)

/**
 * Ordena por fecha y, dentro de cada día, por la cadena de saldos. Si un día no se
 * puede encadenar entero, se queda en el orden que traía (orden estable).
 */
export function ordenarPorCadena<T extends ConSaldo>(movimientos: readonly T[]): T[] {
  const ordenados = movimientos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.fecha < b.m.fecha ? -1 : a.m.fecha > b.m.fecha ? 1 : a.i - b.i))
    .map(({ m }) => m)

  const resultado: T[] = []
  let saldoPrevio: number | null = null
  for (let inicio = 0; inicio < ordenados.length; ) {
    let fin = inicio
    while (fin < ordenados.length && ordenados[fin]!.fecha === ordenados[inicio]!.fecha) fin++
    const dia = ordenados.slice(inicio, fin)
    const encadenado: T[] = encadenarDia(dia, saldoPrevio) ?? encadenarDia(dia, null) ?? dia
    resultado.push(...encadenado)
    saldoPrevio = encadenado[encadenado.length - 1]!.saldo
    inicio = fin
  }
  return resultado
}

/** Busca un orden del día que encadene todos los saldos; null si no existe. */
function encadenarDia<T extends ConSaldo>(dia: T[], saldoPrevio: number | null): T[] | null {
  if (dia.length <= 1) return dia
  if (yaEncadenado(dia, saldoPrevio)) return dia

  // Inicios posibles: si conocemos el saldo previo, los que parten de él; si no, cualquiera
  // cuyo saldo de partida no lo produzca otro movimiento del día.
  const saldosDelDia = new Set(dia.map((m) => m.saldo))
  const inicios = dia
    .map((_, i) => i)
    .filter((i) => {
      const partida = dia[i]!.saldo - dia[i]!.importe
      return saldoPrevio !== null ? partida === saldoPrevio : !saldosDelDia.has(partida)
    })

  let pasos = 0
  const usado = new Array<boolean>(dia.length).fill(false)
  const camino: number[] = []

  const buscar = (): boolean => {
    if (camino.length === dia.length) return true
    if (++pasos > LIMITE_PASOS) return false
    const actual = dia[camino[camino.length - 1]!]!.saldo
    const probados = new Set<string>() // no repetir ramas con movimientos idénticos
    for (let i = 0; i < dia.length; i++) {
      if (usado[i]) continue
      const m = dia[i]!
      if (actual + m.importe !== m.saldo) continue
      const firma = `${m.importe}|${m.saldo}`
      if (probados.has(firma)) continue
      probados.add(firma)
      usado[i] = true
      camino.push(i)
      if (buscar()) return true
      camino.pop()
      usado[i] = false
    }
    return false
  }

  for (const i of inicios) {
    usado[i] = true
    camino.push(i)
    if (buscar()) return camino.map((j) => dia[j]!)
    camino.pop()
    usado[i] = false
  }
  return null
}

function yaEncadenado(dia: ConSaldo[], saldoPrevio: number | null): boolean {
  if (saldoPrevio !== null && dia[0]!.saldo - dia[0]!.importe !== saldoPrevio) return false
  for (let i = 1; i < dia.length; i++) {
    if (dia[i - 1]!.saldo + dia[i]!.importe !== dia[i]!.saldo) return false
  }
  return true
}

/** Posiciones i en las que el saldo no encaja con el anterior (i ≥ 1). */
export function roturas(movimientos: readonly ConSaldo[]): number[] {
  const lista: number[] = []
  for (let i = 1; i < movimientos.length; i++) {
    if (movimientos[i - 1]!.saldo + movimientos[i]!.importe !== movimientos[i]!.saldo) lista.push(i)
  }
  return lista
}
