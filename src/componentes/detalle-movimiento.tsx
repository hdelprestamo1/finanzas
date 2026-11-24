import { useEffect, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import type { Categoria } from '../estado/tipos'
import {
  cambiarCategoriaMovimiento,
  cambiarNota,
  crearReglaComercio,
  restablecerCategoriaAutomatica,
} from '../categorias/operaciones'
import { contienePalabras, textoParaRegla } from '../categorias/clasificar'
import { NOMBRE_TIPO, euros, eurosConSigno, fechaCorta } from '../utilidades/formato'

interface Pregunta {
  categoriaId: string
  texto: string
}

/** Ficha de un movimiento (§12.3): detalle, categoría, nota. */
export function DetalleMovimiento({ id, alCerrar }: { id: string; alCerrar: () => void }) {
  const app = useApp()
  const m = app.estado.movimientos.find((x) => x.id === id)
  const [pregunta, setPregunta] = useState<Pregunta | null>(null)
  const [nota, setNota] = useState(m?.nota ?? '')

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [alCerrar])

  if (!m) return null

  const categoria = app.estado.categorias.find((c) => c.id === m.categoriaId)
  const guardarNota = () => {
    if (nota.trim() !== (m.nota ?? '')) void app.actualizar((e) => cambiarNota(e, m.id, nota))
  }

  // Cuántos movimientos (no editados a mano) cambiaría la regla propuesta.
  const afectados = pregunta
    ? app.estado.movimientos.filter(
        (x) => !x.categoriaManual && x.comercio && contienePalabras(x.comercio, pregunta.texto),
      ).length
    : 0

  return (
    <div class="capa" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="detalle-titulo">
        <header class="hoja-cabecera">
          <h2 id="detalle-titulo">{m.comercio ?? m.textoLibre ?? m.concepto}</h2>
          <button type="button" class="boton-icono" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <p class={m.importe > 0 ? 'importe-grande ingreso' : 'importe-grande'}>
          {eurosConSigno(m.importe)}
        </p>

        <dl class="datos">
          <dt>Fecha</dt>
          <dd>{fechaCorta(m.fecha)}</dd>
          {m.fechaValor !== m.fecha && (
            <>
              <dt>Fecha valor</dt>
              <dd>{fechaCorta(m.fechaValor)}</dd>
            </>
          )}
          <dt>Tipo</dt>
          <dd>{NOMBRE_TIPO[m.tipo]}</dd>
          <dt>Saldo después</dt>
          <dd>{euros(m.saldo)}</dd>
        </dl>
        <p class="concepto-original">{m.concepto}</p>

        <label class="campo">
          <span>
            Categoría
            {m.categoriaManual && <span class="marca neutra">elegida a mano</span>}
          </span>
          <SelectorCategoria
            categorias={app.estado.categorias}
            valor={m.categoriaId}
            alCambiar={(categoriaId) => {
              void app.actualizar((e) => cambiarCategoriaMovimiento(e, m.id, categoriaId))
              setPregunta(m.comercio ? { categoriaId, texto: textoParaRegla(m.comercio) } : null)
            }}
          />
        </label>
        {m.categoriaManual && !pregunta && (
          <button
            type="button"
            class="enlace"
            onClick={() => void app.actualizar((e) => restablecerCategoriaAutomatica(e, m.id))}
          >
            Volver a la categoría automática
          </button>
        )}

        {pregunta && (
          <form
            class="pregunta"
            onSubmit={(e) => {
              e.preventDefault()
              if (!pregunta.texto.trim()) return
              void app.actualizar((est) => crearReglaComercio(est, pregunta.texto, pregunta.categoriaId))
              setPregunta(null)
            }}
          >
            <p>
              ¿Aplicar <strong>{categoria?.nombre}</strong> a todos los de este comercio?
            </p>
            <label class="campo">
              <span>Comercios que contengan</span>
              <input
                type="text"
                value={pregunta.texto}
                onInput={(e) => setPregunta({ ...pregunta, texto: e.currentTarget.value })}
                autocomplete="off"
                autocapitalize="characters"
                spellcheck={false}
              />
            </label>
            <p class="secundario">
              {afectados === 0
                ? 'Ahora no hay otros movimientos de este comercio'
                : `Cambiará ${afectados === 1 ? 'otro movimiento' : `otros ${afectados} movimientos`}`}
              , y se aplicará a los que importes en el futuro. Los elegidos a mano no cambian.
            </p>
            <div class="botones">
              <button type="button" class="boton" onClick={() => setPregunta(null)}>
                Solo este
              </button>
              <button type="submit" class="boton principal" disabled={!pregunta.texto.trim()}>
                Aplicar a todos
              </button>
            </div>
          </form>
        )}

        <label class="campo">
          <span>Nota</span>
          <textarea
            rows={2}
            value={nota}
            onInput={(e) => setNota(e.currentTarget.value)}
            onBlur={guardarNota}
            placeholder="Añade una nota"
          />
        </label>

        <p class="secundario">«Asignar a persona» llega en la fase 6.</p>
      </section>
    </div>
  )
}

/** Desplegable de categorías agrupadas en gastos e ingresos. */
export function SelectorCategoria(props: {
  categorias: Categoria[]
  valor: string
  alCambiar: (id: string) => void
  excluir?: string
  etiqueta?: string
}) {
  const ordenadas = [...props.categorias]
    .filter((c) => c.id !== props.excluir)
    .sort((a, b) => a.orden - b.orden)
  const grupo = (tipos: Categoria['tipo'][]) => ordenadas.filter((c) => tipos.includes(c.tipo))
  return (
    <select
      value={props.valor}
      aria-label={props.etiqueta}
      onChange={(e) => props.alCambiar(e.currentTarget.value)}
    >
      <optgroup label="Gastos">
        {grupo(['gasto', 'ambos']).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </optgroup>
      <optgroup label="Ingresos">
        {grupo(['ingreso']).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
