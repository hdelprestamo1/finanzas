import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Chart as TipoChart, ChartConfiguration, Plugin, ScriptableContext, TooltipItem } from 'chart.js'
import { useApp } from '../estado/contexto'
import type { Categoria } from '../estado/tipos'
import { Grafica, type Colores } from '../componentes/grafica'
import {
  anios,
  mesPorDefecto,
  mesesConDatos,
  resumenPeriodo,
  serieMensual,
  serieSaldoDiaria,
  type TotalCategoria,
} from '../estadisticas/resumen'
import { euros, eurosConSigno, fechaCorta, fechaLarga, nombreMes } from '../utilidades/formato'

const MAX_SEGMENTOS = 6 // el resto se agrupa en "Resto" (nunca más de 7 colores)
const ID_RESTO = '__resto'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesCorto = (aaaamm: string) => {
  const [a, m] = aaaamm.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${a!.slice(2)}`
}

/** Euros compactos para los ejes ("1,2 mil €"). */
const formatoEje = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const eje = (c: number) => formatoEje.format(c / 100)

function escalas(colores: Colores) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: colores.ejeTexto, maxRotation: 0, autoSkipPadding: 10, font: { size: 11 } },
    },
    y: {
      grid: { color: colores.rejilla },
      border: { display: false },
      ticks: {
        color: colores.ejeTexto,
        callback: (v: string | number) => eje(Number(v)),
        maxTicksLimit: 5,
        padding: 8,
        font: { size: 11 },
      },
    },
  }
}

function tooltip(colores: Colores) {
  return {
    backgroundColor: '#1f1f23',
    titleColor: colores.texto,
    bodyColor: colores.texto2,
    footerColor: colores.texto,
    borderWidth: 0,
    cornerRadius: 12,
    padding: 12,
    boxPadding: 5,
    usePointStyle: true,
    titleFont: { weight: 600 as const },
  }
}

/** "#3b82f6" + 0.4 → "#3b82f666" */
function conAlfa(hex: string, alfa: number): string {
  return `${hex}${Math.round(alfa * 255)
    .toString(16)
    .padStart(2, '0')}`
}

/** Relleno en degradado vertical (de `arriba` a `abajo` de opacidad). */
function degradado<T extends 'bar' | 'line'>(color: string, arriba: number, abajo: number) {
  return ({ chart }: ScriptableContext<T>) => {
    const area = chart.chartArea
    if (!area) return conAlfa(color, arriba)
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    g.addColorStop(0, conAlfa(color, arriba))
    g.addColorStop(1, conAlfa(color, abajo))
    return g
  }
}

/** Línea vertical discontinua en el punto que se está mirando. */
function lineaGuia(colores: Colores): Plugin<'line'> {
  return {
    id: 'lineaGuia',
    afterDatasetsDraw(chart) {
      const activos = chart.tooltip?.getActiveElements()
      if (!activos?.length) return
      const x = activos[0]!.element.x
      const { top, bottom } = chart.chartArea
      const ctx = chart.ctx
      ctx.save()
      ctx.strokeStyle = colores.texto3
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.restore()
    },
  }
}

export function Graficas() {
  const { estado } = useApp()

  if (estado.movimientos.length === 0) {
    return (
      <section class="tarjeta vacia">
        <p>Aún no hay datos que dibujar.</p>
        <p class="secundario">
          <a href="#/importar">Importa un extracto</a> para ver las gráficas.
        </p>
      </section>
    )
  }

  return (
    <>
      <IngresosGastos />
      <GastoPorCategoria />
      <EvolucionSaldo />
      <ResumenAnual />
    </>
  )
}

// --- Barras: ingresos (arriba) y gastos (abajo) por mes ------------------------------

function IngresosGastos() {
  const { estado } = useApp()
  const hoy = new Date().toISOString().slice(0, 10)
  const serie = useMemo(() => {
    const meses = mesesConDatos(estado.movimientos, mesPorDefecto(estado.movimientos, hoy), 12)
    return serieMensual(estado.movimientos, estado.categorias, meses)
  }, [estado.movimientos, estado.categorias, hoy])

  const totalIngresos = serie.reduce((s, x) => s + x.ingresos, 0)
  const totalGastos = serie.reduce((s, x) => s + x.gastos, 0)
  const meses = serie.length

  const crear = (colores: Colores) =>
    ({
      type: 'bar',
      data: {
        labels: serie.map((s) => mesCorto(s.mes)),
        datasets: [
          {
            label: 'Ingresos',
            data: serie.map((s) => s.ingresos),
            backgroundColor: colores.ingreso,
            hoverBackgroundColor: colores.ingreso,
            stack: 'flujo',
            order: 2,
          },
          {
            label: 'Gastos',
            data: serie.map((s) => -s.gastos),
            backgroundColor: colores.gasto,
            hoverBackgroundColor: colores.gasto,
            stack: 'flujo',
            order: 2,
          },
          {
            type: 'line',
            label: 'Balance',
            data: serie.map((s) => s.balance),
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: colores.texto,
            pointBorderColor: colores.superficie,
            pointBorderWidth: 2,
            order: 1,
          },
        ].map((d) =>
          d.type === 'line'
            ? d
            : {
                ...d,
                borderRadius: 8,
                borderSkipped: 'start',
                barPercentage: 0.7,
                categoryPercentage: 0.8,
                maxBarThickness: 40,
              },
        ),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { color: colores.ejeTexto, maxRotation: 0, font: { size: 11 } },
          },
          y: {
            stacked: true,
            border: { display: false },
            grid: {
              // La línea del cero, más marcada: separa ingresos (arriba) de gastos (abajo).
              color: (c: { tick?: { value: number } }) => (c.tick?.value === 0 ? colores.eje : colores.rejilla),
              lineWidth: (c: { tick?: { value: number } }) => (c.tick?.value === 0 ? 1.5 : 1),
            },
            ticks: {
              color: colores.ejeTexto,
              callback: (v: string | number) => eje(Math.abs(Number(v))),
              maxTicksLimit: 6,
              padding: 8,
              font: { size: 11 },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltip(colores),
            callbacks: {
              title: (items: TooltipItem<'bar'>[]) => nombreMes(serie[items[0]!.dataIndex]!.mes),
              label: (i: TooltipItem<'bar'>) =>
                ` ${i.dataset.label}: ${i.dataset.label === 'Balance' ? eurosConSigno(i.parsed.y ?? 0) : euros(Math.abs(i.parsed.y ?? 0))}`,
            },
          },
        },
      },
    }) as unknown as ChartConfiguration<'bar'>

  return (
    <section class="tarjeta">
      <h2>Ingresos y gastos</h2>
      <p class="secundario">
        {meses === 1 ? nombreMes(serie[0]!.mes) : `Últimos ${meses} meses`}
      </p>
      <div class="resumen-flujo">
        <div>
          <span class="leyenda-punto" style={{ '--color-leyenda': 'var(--serie-ingreso)' }}>
            Ingresos
          </span>
          <strong>{euros(totalIngresos)}</strong>
        </div>
        <div>
          <span class="leyenda-punto" style={{ '--color-leyenda': 'var(--serie-gasto)' }}>
            Gastos
          </span>
          <strong>{euros(totalGastos)}</strong>
        </div>
        <div>
          <span class="leyenda-punto leyenda-balance">Balance</span>
          <strong class={totalIngresos - totalGastos < 0 ? 'gasto' : 'ingreso'}>
            {eurosConSigno(totalIngresos - totalGastos)}
          </strong>
        </div>
      </div>
      <Grafica
        crear={crear}
        clave={JSON.stringify(serie)}
        alto={240}
        descripcion={`Gráfica de barras por mes: ingresos hacia arriba y gastos hacia abajo. Total ingresos ${euros(totalIngresos)}, gastos ${euros(totalGastos)}`}
      />
    </section>
  )
}

// --- Donut: gasto por categoría -------------------------------------------------------

function agrupar(lista: TotalCategoria[]): TotalCategoria[] {
  if (lista.length <= MAX_SEGMENTOS + 1) return lista
  const resto = lista.slice(MAX_SEGMENTOS).reduce((s, x) => s + x.importe, 0)
  return [...lista.slice(0, MAX_SEGMENTOS), { categoriaId: ID_RESTO, importe: resto }]
}

function GastoPorCategoria() {
  const { estado } = useApp()
  const hoy = new Date().toISOString().slice(0, 10)
  const [modo, setModo] = useState<'mes' | 'anio'>('mes')
  const meses = useMemo(
    () => [...new Set(estado.movimientos.map((m) => m.fecha.slice(0, 7)))].sort().reverse(),
    [estado.movimientos],
  )
  const listaAnios = useMemo(() => anios(estado.movimientos), [estado.movimientos])
  const [mes, setMes] = useState(() => mesPorDefecto(estado.movimientos, hoy))
  const [anio, setAnio] = useState(() => listaAnios[0] ?? hoy.slice(0, 4))
  const periodo = modo === 'mes' ? mes : anio

  const resumen = useMemo(
    () => resumenPeriodo(estado.movimientos, estado.categorias, periodo),
    [estado.movimientos, estado.categorias, periodo],
  )
  const segmentos = agrupar(resumen.gastosPorCategoria)
  const porId = new Map(estado.categorias.map((c) => [c.id, c]))
  const info = (id: string): Pick<Categoria, 'nombre' | 'color'> | undefined =>
    id === ID_RESTO ? { nombre: 'Resto', color: 'var(--serie-resto)' } : porId.get(id)
  const total = resumen.gastos

  const crear = (colores: Colores): ChartConfiguration<'doughnut'> => ({
    type: 'doughnut',
    data: {
      labels: segmentos.map((s) => info(s.categoriaId)?.nombre ?? '—'),
      datasets: [
        {
          data: segmentos.map((s) => s.importe),
          backgroundColor: segmentos.map((s) =>
            s.categoriaId === ID_RESTO ? colores.resto : (porId.get(s.categoriaId)?.color ?? colores.resto),
          ),
          borderWidth: 0,
          spacing: 3,
          borderRadius: 6,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '76%',
      layout: { padding: 6 },
      plugins: {
        legend: { display: false }, // la leyenda es la lista de debajo (con importes y %)
        tooltip: {
          ...tooltip(colores),
          callbacks: {
            label: (i: TooltipItem<'doughnut'>) =>
              ` ${i.label}: ${euros(i.parsed)} (${porcentaje(i.parsed, total)})`,
          },
        },
      },
    },
  })

  return (
    <section class="tarjeta">
      <h2>Gasto por categoría</h2>
      <div class="filtros-grafica">
        <div class="segmentado" role="group" aria-label="Periodo">
          <button type="button" aria-pressed={modo === 'mes'} onClick={() => setModo('mes')}>
            Mes
          </button>
          <button type="button" aria-pressed={modo === 'anio'} onClick={() => setModo('anio')}>
            Año
          </button>
        </div>
        {modo === 'mes' ? (
          <select value={mes} onChange={(e) => setMes(e.currentTarget.value)} aria-label="Mes">
            {!meses.includes(mes) && <option value={mes}>{nombreMes(mes)}</option>}
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        ) : (
          <select value={anio} onChange={(e) => setAnio(e.currentTarget.value)} aria-label="Año">
            {listaAnios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      {total <= 0 ? (
        <p class="secundario">No hay gastos en este periodo.</p>
      ) : (
        <>
          <div class="donut">
            <Grafica
              crear={crear}
              clave={JSON.stringify([segmentos, porId.size, [...porId.values()].map((c) => c.color + c.nombre)])}
              alto={220}
              descripcion={`Gráfica circular del gasto por categoría: total ${euros(total)}`}
            />
            <div class="donut-centro" aria-hidden="true">
              <span class="secundario">Total</span>
              <strong>{euros(total)}</strong>
            </div>
          </div>
          <ul class="leyenda">
            {segmentos.map((s) => {
              const c = info(s.categoriaId)
              return (
                <li key={s.categoriaId}>
                  <span class="punto" style={{ background: c?.color }} aria-hidden="true" />
                  <span class="leyenda-nombre">{c?.nombre ?? '—'}</span>
                  <span class="leyenda-valor">{euros(s.importe)}</span>
                  <span class="leyenda-pct">{porcentaje(s.importe, total)}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

// --- Línea: evolución del saldo (desplazable) -----------------------------------------------

const RANGOS = [
  { id: '1m', texto: '1M', dias: 30 },
  { id: '3m', texto: '3M', dias: 91 },
  { id: '6m', texto: '6M', dias: 182 },
  { id: '1a', texto: '1A', dias: 365 },
  { id: 'todo', texto: 'Todo', dias: Infinity },
] as const
type IdRango = (typeof RANGOS)[number]['id']

function EvolucionSaldo() {
  const { estado } = useApp()
  const serie = useMemo(() => serieSaldoDiaria(estado.movimientos), [estado.movimientos])
  const total = serie.length
  const [rango, setRango] = useState<IdRango>('3m')
  const dias = Math.min(total, RANGOS.find((r) => r.id === rango)!.dias)
  const [fin, setFin] = useState(total - 1) // índice del último día visible
  const finVisible = Math.min(Math.max(fin, dias - 1), total - 1)
  const inicio = finVisible - dias + 1
  const grafica = useRef<TipoChart<'line'> | null>(null)
  const zona = useRef<HTMLDivElement>(null)

  // Al cambiar los datos (nueva importación), volver al final.
  useEffect(() => setFin(total - 1), [total])

  // Mueve la ventana visible sin redibujar la gráfica entera.
  const aplicarVentana = (g: TipoChart<'line'> | null) => {
    if (!g || total === 0) return
    const visibles = serie.slice(inicio, finVisible + 1).map((p) => p.saldo)
    const min = Math.min(...visibles)
    const max = Math.max(...visibles)
    const margen = Math.max((max - min) * 0.12, 500)
    const x = g.options.scales!.x!
    const y = g.options.scales!.y!
    x.min = inicio
    x.max = finVisible
    y.min = Math.floor((min - margen) / 1000) * 1000
    y.max = Math.ceil((max + margen) / 1000) * 1000
    g.update('none')
  }
  useEffect(() => aplicarVentana(grafica.current), [inicio, finVisible, total])

  // Arrastrar (dedo o ratón) y rueda/trackpad horizontal para desplazarse.
  useEffect(() => {
    const el = zona.current
    if (!el) return
    let arrastre: { x: number; fin: number } | null = null
    const puntosPorPixel = () => dias / Math.max(1, el.clientWidth - 50)
    const mover = (nuevoFin: number) => setFin(Math.min(total - 1, Math.max(dias - 1, Math.round(nuevoFin))))
    const abajo = (e: PointerEvent) => {
      arrastre = { x: e.clientX, fin: finVisible }
      el.setPointerCapture(e.pointerId)
    }
    const movimiento = (e: PointerEvent) => {
      if (arrastre) mover(arrastre.fin - (e.clientX - arrastre.x) * puntosPorPixel())
    }
    const arriba = () => {
      arrastre = null
    }
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return // scroll vertical: la página
      e.preventDefault()
      mover(finVisible + e.deltaX * puntosPorPixel())
    }
    el.addEventListener('pointerdown', abajo)
    el.addEventListener('pointermove', movimiento)
    el.addEventListener('pointerup', arriba)
    el.addEventListener('pointercancel', arriba)
    el.addEventListener('wheel', rueda, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointermove', movimiento)
      el.removeEventListener('pointerup', arriba)
      el.removeEventListener('pointercancel', arriba)
      el.removeEventListener('wheel', rueda)
    }
  }, [dias, total, finVisible])

  if (total === 0) return null

  const crear = (colores: Colores): ChartConfiguration<'line'> => ({
    type: 'line',
    data: {
      labels: serie.map((s) => fechaCorta(s.fecha).slice(0, 5)),
      datasets: [
        {
          label: 'Saldo',
          data: serie.map((s) => s.saldo),
          borderColor: colores.saldo,
          backgroundColor: degradado<'line'>(colores.saldo, 0.35, 0),
          fill: 'start',
          borderWidth: 2,
          pointRadius: 0,
          pointBackgroundColor: colores.saldo,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: colores.saldo,
          pointHoverBorderColor: '#000',
          stepped: 'before', // el saldo se mantiene hasta el siguiente movimiento
        },
      ],
    },
    plugins: [lineaGuia(colores)],
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        ...escalas(colores),
        x: {
          ...escalas(colores).x,
          min: inicio,
          max: finVisible,
          ticks: { ...escalas(colores).x.ticks, maxTicksLimit: 6, autoSkip: true },
        },
      },
      plugins: {
        legend: { display: false }, // una sola serie: el título la nombra
        tooltip: {
          ...tooltip(colores),
          callbacks: {
            title: (items: TooltipItem<'line'>[]) => fechaLarga(serie[items[0]!.dataIndex]!.fecha),
            label: (i: TooltipItem<'line'>) => ` Saldo: ${euros(i.parsed.y ?? 0)}`,
          },
        },
      },
    },
  })

  const desde = serie[inicio]!
  const hasta = serie[finVisible]!
  const puedeMoverse = dias < total

  return (
    <section class="tarjeta">
      <div class="cabecera-grafica">
        <div>
          <h2>Evolución del saldo</h2>
          <p class="secundario">
            {fechaCorta(desde.fecha)} – {fechaCorta(hasta.fecha)}
          </p>
        </div>
        <div class="cifra-grafica">
          <strong>{euros(hasta.saldo)}</strong>
          <span class={hasta.saldo - desde.saldo < 0 ? 'gasto' : 'ingreso'}>
            {eurosConSigno(hasta.saldo - desde.saldo)}
          </span>
        </div>
      </div>
      <div class="segmentado rangos" role="group" aria-label="Periodo visible">
        {RANGOS.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={rango === r.id}
            onClick={() => {
              setRango(r.id)
              setFin(total - 1)
            }}
          >
            {r.texto}
          </button>
        ))}
      </div>
      <div ref={zona} class={puedeMoverse ? 'zona-desplazable' : undefined}>
        <Grafica
          crear={crear}
          clave={JSON.stringify(serie)}
          alto={210}
          descripcion={`Gráfica de línea del saldo del ${fechaCorta(desde.fecha)} al ${fechaCorta(hasta.fecha)}: de ${euros(desde.saldo)} a ${euros(hasta.saldo)}`}
          alCrear={(g) => {
            grafica.current = g
            aplicarVentana(g)
          }}
        />
      </div>
      {puedeMoverse && (
        <div class="navegacion-saldo">
          <button
            type="button"
            class="boton-icono"
            aria-label="Antes"
            disabled={inicio === 0}
            onClick={() => setFin(Math.max(dias - 1, finVisible - Math.ceil(dias / 2)))}
          >
            ‹
          </button>
          <div class="pista-saldo" aria-hidden="true">
            <div
              class="pulgar-saldo"
              style={{ left: `${(inicio / total) * 100}%`, width: `${(dias / total) * 100}%` }}
            />
          </div>
          <button
            type="button"
            class="boton-icono"
            aria-label="Después"
            disabled={finVisible === total - 1}
            onClick={() => setFin(Math.min(total - 1, finVisible + Math.ceil(dias / 2)))}
          >
            ›
          </button>
        </div>
      )}
      {puedeMoverse && <p class="ayuda centrada">Arrastra la gráfica para ver otras fechas</p>}
    </section>
  )
}

// --- Resumen anual (tabla) ------------------------------------------------------------------

function ResumenAnual() {
  const { estado } = useApp()
  const listaAnios = useMemo(() => anios(estado.movimientos), [estado.movimientos])
  const [anio, setAnio] = useState(() => listaAnios[0]!)
  const r = useMemo(
    () => resumenPeriodo(estado.movimientos, estado.categorias, anio),
    [estado.movimientos, estado.categorias, anio],
  )
  const porId = new Map(estado.categorias.map((c) => [c.id, c]))

  const filas = (lista: TotalCategoria[], total: number) =>
    lista.map((t) => {
      const c = porId.get(t.categoriaId)
      return (
        <tr key={t.categoriaId}>
          <th scope="row">
            <span class="punto" style={{ background: c?.color }} aria-hidden="true" />
            {c?.nombre ?? '—'}
          </th>
          <td>{euros(t.importe)}</td>
          <td>{porcentaje(t.importe, total)}</td>
        </tr>
      )
    })

  return (
    <section class="tarjeta">
      <div class="titulo-con-filtro">
        <h2>Resumen anual</h2>
        <select value={anio} onChange={(e) => setAnio(e.currentTarget.value)} aria-label="Año">
          {listaAnios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <table class="tabla-resumen">
        <thead>
          <tr>
            <th scope="col">Gastos</th>
            <th scope="col">Importe</th>
            <th scope="col">%</th>
          </tr>
        </thead>
        <tbody>{filas(r.gastosPorCategoria, r.gastos)}</tbody>
        <tfoot>
          <tr>
            <th scope="row">Total gastos</th>
            <td>{euros(r.gastos)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <table class="tabla-resumen">
        <thead>
          <tr>
            <th scope="col">Ingresos</th>
            <th scope="col">Importe</th>
            <th scope="col">%</th>
          </tr>
        </thead>
        <tbody>{filas(r.ingresosPorCategoria, r.ingresos)}</tbody>
        <tfoot>
          <tr>
            <th scope="row">Total ingresos</th>
            <td>{euros(r.ingresos)}</td>
            <td />
          </tr>
          <tr>
            <th scope="row">Balance</th>
            <td>{euros(r.balance)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function porcentaje(parte: number, total: number): string {
  if (total <= 0) return '—'
  return `${((parte / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}
