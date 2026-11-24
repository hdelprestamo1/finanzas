import { useMemo, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import {
  desplazarMes,
  mesPorDefecto,
  resumenPeriodo,
  saldoActual,
} from '../estadisticas/resumen'
import { euros, eurosConSigno, fechaCorta, nombreMes } from '../utilidades/formato'

const TOP_CATEGORIAS = 5

export function Inicio() {
  const { estado } = useApp()
  const hoy = new Date().toISOString().slice(0, 10)
  const [mes, setMes] = useState(() => mesPorDefecto(estado.movimientos, hoy))

  const resumen = useMemo(
    () => resumenPeriodo(estado.movimientos, estado.categorias, mes),
    [estado.movimientos, estado.categorias, mes],
  )
  const categorias = useMemo(() => new Map(estado.categorias.map((c) => [c.id, c])), [estado.categorias])

  if (estado.movimientos.length === 0) {
    return (
      <section class="tarjeta vacia">
        <p>Bienvenido. Aún no hay movimientos.</p>
        <p class="secundario">
          Empieza en <a href="#/importar">Importar</a> con el Excel de movimientos de Kutxabank.
        </p>
      </section>
    )
  }

  const primerMes = estado.movimientos[0]!.fecha.slice(0, 7)
  const ultimoMes = estado.movimientos[estado.movimientos.length - 1]!.fecha.slice(0, 7)
  const ultimo = estado.movimientos[estado.movimientos.length - 1]!
  const top = resumen.gastosPorCategoria.slice(0, TOP_CATEGORIAS)
  const maximo = top[0]?.importe ?? 1

  return (
    <>
      <section class="saldo-hero">
        <span class="etiqueta">Saldo actual</span>
        <span class="valor">{euros(saldoActual(estado.movimientos) ?? 0)}</span>
        <span class="nota">a {fechaCorta(ultimo.fecha)}</span>
      </section>

      <nav class="selector-mes" aria-label="Mes">
        <button
          type="button"
          class="boton-icono"
          onClick={() => setMes(desplazarMes(mes, -1))}
          disabled={mes <= primerMes}
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <h2>{nombreMes(mes)}</h2>
        <button
          type="button"
          class="boton-icono"
          onClick={() => setMes(desplazarMes(mes, 1))}
          disabled={mes >= ultimoMes}
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </nav>

      <section class="cifras">
        <div class="cifra ingresos">
          <span class="cifra-etiqueta">Ingresos</span>
          <span class="cifra-valor">{euros(resumen.ingresos)}</span>
        </div>
        <div class="cifra gastos">
          <span class="cifra-etiqueta">Gastos</span>
          <span class="cifra-valor">{euros(resumen.gastos)}</span>
        </div>
        <div class="cifra">
          <span class="cifra-etiqueta">Balance</span>
          <span class={resumen.balance < 0 ? 'cifra-valor gasto' : 'cifra-valor ingreso'}>
            {eurosConSigno(resumen.balance)}
          </span>
        </div>
      </section>

      <section class="tarjeta">
        <h2>En qué has gastado</h2>
        {top.length === 0 ? (
          <p class="secundario">No hay gastos este mes.</p>
        ) : (
          <ul class="barras-categoria">
            {top.map((t) => {
              const c = categorias.get(t.categoriaId)
              return (
                <li key={t.categoriaId}>
                  <div class="barra-cabecera">
                    <span>{c?.nombre ?? '—'}</span>
                    <span class="barra-importe">{euros(t.importe)}</span>
                  </div>
                  <div class="barra-pista" aria-hidden="true">
                    <div
                      class="barra-relleno"
                      style={{
                        width: `${Math.max(2, (t.importe / maximo) * 100)}%`,
                        background: c?.color ?? 'var(--serie-resto)',
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <a class="enlace-tarjeta" href="#/graficas">
          Ver gráficas
        </a>
      </section>

      <p class="secundario nota-fases">
        Las personas con saldo pendiente y las preguntas de emparejado de Bizum llegan en la fase 6;
        el aviso de copia de seguridad, en la 7.
      </p>
    </>
  )
}
