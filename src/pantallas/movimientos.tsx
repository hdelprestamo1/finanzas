import { useMemo, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import type { Movimiento, TipoMovimiento } from '../estado/tipos'
import { NOMBRE_TIPO, euros, eurosConSigno, fechaLarga, nombreMes } from '../utilidades/formato'
import { normalizar } from '../utilidades/texto'
import { DetalleMovimiento } from '../componentes/detalle-movimiento'

type Sentido = 'todos' | 'ingresos' | 'gastos'

export function Movimientos() {
  const { estado } = useApp()
  const [busqueda, setBusqueda] = useState('')
  const [mes, setMes] = useState('todos')
  const [tipo, setTipo] = useState<'todos' | TipoMovimiento>('todos')
  const [sentido, setSentido] = useState<Sentido>('todos')
  const [categoria, setCategoria] = useState('todas')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  const categorias = useMemo(
    () => new Map(estado.categorias.map((c) => [c.id, c])),
    [estado.categorias],
  )

  const meses = useMemo(
    () => [...new Set(estado.movimientos.map((m) => m.fecha.slice(0, 7)))].sort().reverse(),
    [estado.movimientos],
  )

  const filtrados = useMemo(() => {
    const texto = normalizar(busqueda)
    return estado.movimientos.filter(
      (m) =>
        (mes === 'todos' || m.fecha.startsWith(mes)) &&
        (tipo === 'todos' || m.tipo === tipo) &&
        (categoria === 'todas' || m.categoriaId === categoria) &&
        (sentido === 'todos' || (sentido === 'ingresos' ? m.importe > 0 : m.importe < 0)) &&
        (!texto ||
          normalizar(m.concepto).includes(texto) ||
          normalizar(m.nota ?? '').includes(texto)),
    )
  }, [estado.movimientos, busqueda, mes, tipo, sentido, categoria])

  // Agrupados por día, del más reciente al más antiguo (dentro del día, el último primero).
  const porDia = useMemo(() => {
    const grupos = new Map<string, Movimiento[]>()
    for (let i = filtrados.length - 1; i >= 0; i--) {
      const m = filtrados[i]!
      const lista = grupos.get(m.fecha)
      if (lista) lista.push(m)
      else grupos.set(m.fecha, [m])
    }
    return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtrados])

  if (estado.movimientos.length === 0) {
    return (
      <section class="tarjeta vacia">
        <p>Aún no hay movimientos.</p>
        <p class="secundario">
          <a href="#/importar">Importa un extracto</a> para empezar.
        </p>
      </section>
    )
  }

  const ultimo = estado.movimientos[estado.movimientos.length - 1]!
  const ingresos = filtrados.reduce((s, m) => s + (m.importe > 0 ? m.importe : 0), 0)
  const gastos = filtrados.reduce((s, m) => s + (m.importe < 0 ? m.importe : 0), 0)

  return (
    <>
      <section class="tarjeta filtros">
        <input
          type="search"
          value={busqueda}
          onInput={(e) => setBusqueda(e.currentTarget.value)}
          placeholder="Buscar concepto o nota"
          aria-label="Buscar"
        />
        <div class="filtros-fila">
          <select value={mes} onChange={(e) => setMes(e.currentTarget.value)} aria-label="Mes">
            <option value="todos">Todos los meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.currentTarget.value as typeof tipo)}
            aria-label="Tipo"
          >
            <option value="todos">Todos los tipos</option>
            {(Object.keys(NOMBRE_TIPO) as TipoMovimiento[]).map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO[t]}
              </option>
            ))}
          </select>
          <select
            value={sentido}
            onChange={(e) => setSentido(e.currentTarget.value as Sentido)}
            aria-label="Ingresos o gastos"
          >
            <option value="todos">Ingresos y gastos</option>
            <option value="ingresos">Solo ingresos</option>
            <option value="gastos">Solo gastos</option>
          </select>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.currentTarget.value)}
            aria-label="Categoría"
          >
            <option value="todas">Todas las categorías</option>
            {[...estado.categorias]
              .sort((a, b) => a.orden - b.orden)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </div>
        <dl class="datos resumen">
          <dt>{filtrados.length} movimientos</dt>
          <dd>
            <span class="ingreso">{eurosConSigno(ingresos)}</span> ·{' '}
            <span class="gasto">{euros(gastos)}</span>
          </dd>
          <dt>Saldo actual</dt>
          <dd>{euros(ultimo.saldo)}</dd>
        </dl>
      </section>

      {porDia.length === 0 && <p class="tarjeta vacia">Ningún movimiento con estos filtros.</p>}

      {porDia.map(([fecha, lista]) => (
        <section key={fecha} class="dia">
          <h3>{fechaLarga(fecha)}</h3>
          <ul class="movimientos tarjeta">
            {lista.map((m) => (
              <li key={m.id}>
                <button type="button" class="fila-mov" onClick={() => setSeleccionado(m.id)}>
                <span
                  class="punto"
                  style={{ background: categorias.get(m.categoriaId)?.color ?? 'var(--texto-2)' }}
                  aria-hidden="true"
                />
                <div class="mov-texto">
                  <span class="mov-concepto">{m.comercio ?? m.textoLibre ?? m.concepto}</span>
                  <span class="mov-detalle">
                    {NOMBRE_TIPO[m.tipo]} · {categorias.get(m.categoriaId)?.nombre ?? '—'}
                    {m.nota && <> · {m.nota}</>}
                  </span>
                </div>
                <div class="mov-cifras">
                  <span class={m.importe > 0 ? 'mov-importe ingreso' : 'mov-importe'}>
                    {eurosConSigno(m.importe)}
                  </span>
                  <span class="mov-saldo">{euros(m.saldo)}</span>
                </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {seleccionado && (
        <DetalleMovimiento id={seleccionado} alCerrar={() => setSeleccionado(null)} />
      )}
    </>
  )
}
