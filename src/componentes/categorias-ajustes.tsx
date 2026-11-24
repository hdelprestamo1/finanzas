import { useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import type { Categoria } from '../estado/tipos'
import {
  borrarCategoria,
  borrarRegla,
  crearCategoria,
  editarCategoria,
  nombreRepetido,
} from '../categorias/operaciones'
import { CATEGORIAS_PROTEGIDAS, REGLAS_POR_DEFECTO } from '../categorias/clasificar'
import { SelectorCategoria } from './detalle-movimiento'

const NOMBRE_TIPO_CATEGORIA: Record<Categoria['tipo'], string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  ambos: 'Gasto e ingreso',
}

/** Crear, renombrar, recolorear y borrar categorías (§9.1). */
export function Categorias() {
  const app = useApp()
  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const ordenadas = [...app.estado.categorias].sort((a, b) => a.orden - b.orden)
  const usos = new Map<string, number>()
  for (const m of app.estado.movimientos) usos.set(m.categoriaId, (usos.get(m.categoriaId) ?? 0) + 1)

  return (
    <section class="tarjeta">
      <h2>Categorías</h2>
      <ul class="lista-categorias">
        {ordenadas.map((c) =>
          editando === c.id ? (
            <li key={c.id}>
              <EditarCategoria categoria={c} usos={usos.get(c.id) ?? 0} alTerminar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={c.id}>
              <button type="button" class="fila-categoria" onClick={() => setEditando(c.id)}>
                <span class="punto" style={{ background: c.color }} aria-hidden="true" />
                <span class="nombre">{c.nombre}</span>
                <span class="secundario">
                  {NOMBRE_TIPO_CATEGORIA[c.tipo]} · {usos.get(c.id) ?? 0}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {creando ? (
        <FormularioCategoria
          inicial={{ nombre: '', tipo: 'gasto', color: '#4b5bd6' }}
          textoBoton="Crear"
          alCancelar={() => setCreando(false)}
          alGuardar={(datos) => {
            void app.actualizar((e) => crearCategoria(e, datos))
            setCreando(false)
          }}
        />
      ) : (
        <button type="button" class="boton" onClick={() => setCreando(true)}>
          Nueva categoría
        </button>
      )}
    </section>
  )
}

function EditarCategoria(props: { categoria: Categoria; usos: number; alTerminar: () => void }) {
  const app = useApp()
  const { categoria: c } = props
  const [borrando, setBorrando] = useState(false)
  const [destino, setDestino] = useState(c.tipo === 'ingreso' ? 'otros-ingresos' : 'otros-gastos')
  const protegida = CATEGORIAS_PROTEGIDAS.has(c.id)

  if (borrando) {
    return (
      <div class="formulario editar-categoria">
        <p>
          Borrar <strong>{c.nombre}</strong>.{' '}
          {props.usos === 0
            ? '¿A qué categoría paso sus reglas, si las hay?'
            : props.usos === 1
              ? '¿A qué categoría paso su movimiento y sus reglas?'
              : `¿A qué categoría paso sus ${props.usos} movimientos y sus reglas?`}
        </p>
        <SelectorCategoria
          categorias={app.estado.categorias}
          valor={destino}
          alCambiar={setDestino}
          excluir={c.id}
          etiqueta="Categoría de destino"
        />
        <div class="botones">
          <button type="button" class="boton" onClick={() => setBorrando(false)}>
            Cancelar
          </button>
          <button
            type="button"
            class="boton peligro relleno"
            onClick={() => {
              void app.actualizar((e) => borrarCategoria(e, c.id, destino))
              props.alTerminar()
            }}
          >
            Borrar y mover
          </button>
        </div>
      </div>
    )
  }

  return (
    <FormularioCategoria
      inicial={c}
      excepto={c.id}
      textoBoton="Guardar"
      alCancelar={props.alTerminar}
      alGuardar={(datos) => {
        void app.actualizar((e) => editarCategoria(e, c.id, datos))
        props.alTerminar()
      }}
      extra={
        protegida ? (
          <p class="secundario">La app usa esta categoría: se puede renombrar pero no borrar.</p>
        ) : (
          <button type="button" class="enlace peligro" onClick={() => setBorrando(true)}>
            Borrar categoría
          </button>
        )
      }
    />
  )
}

function FormularioCategoria(props: {
  inicial: Pick<Categoria, 'nombre' | 'tipo' | 'color'>
  excepto?: string
  textoBoton: string
  alGuardar: (datos: Pick<Categoria, 'nombre' | 'tipo' | 'color'>) => void
  alCancelar: () => void
  extra?: preact.ComponentChildren
}) {
  const { estado } = useApp()
  const [nombre, setNombre] = useState(props.inicial.nombre)
  const [tipo, setTipo] = useState(props.inicial.tipo)
  const [color, setColor] = useState(props.inicial.color)
  const repetido = nombre.trim() !== '' && nombreRepetido(estado, nombre, props.excepto)
  const valido = nombre.trim() !== '' && !repetido

  return (
    <form
      class="formulario editar-categoria"
      onSubmit={(e) => {
        e.preventDefault()
        if (valido) props.alGuardar({ nombre, tipo, color })
      }}
    >
      <div class="fila-formulario">
        <input
          type="color"
          value={color}
          onInput={(e) => setColor(e.currentTarget.value)}
          aria-label="Color"
        />
        <input
          type="text"
          value={nombre}
          onInput={(e) => setNombre(e.currentTarget.value)}
          aria-label="Nombre"
          placeholder="Nombre"
          autofocus
        />
      </div>
      {repetido && <span class="ayuda error">Ya hay una categoría con ese nombre</span>}
      <select value={tipo} onChange={(e) => setTipo(e.currentTarget.value as Categoria['tipo'])} aria-label="Tipo">
        <option value="gasto">Gasto</option>
        <option value="ingreso">Ingreso</option>
        <option value="ambos">Gasto e ingreso</option>
      </select>
      <div class="botones">
        {props.extra && <span class="extra">{props.extra}</span>}
        <button type="button" class="boton" onClick={props.alCancelar}>
          Cancelar
        </button>
        <button type="submit" class="boton principal" disabled={!valido}>
          {props.textoBoton}
        </button>
      </div>
    </form>
  )
}

/** Reglas del usuario (borrables) y reglas por defecto (solo lectura) (§9.2). */
export function Reglas() {
  const app = useApp()
  const nombre = (id: string) => app.estado.categorias.find((c) => c.id === id)?.nombre ?? '—'
  const usuario = [...app.estado.reglas].reverse()
  const porDefecto = REGLAS_POR_DEFECTO.filter((r) => app.estado.categorias.some((c) => c.id === r.categoriaId))

  return (
    <section class="tarjeta">
      <h2>Reglas</h2>
      <p class="secundario">
        Se crean al cambiar la categoría de un movimiento y elegir «Aplicar a todos». Tienen
        prioridad sobre las reglas por defecto.
      </p>
      {usuario.length === 0 ? (
        <p class="secundario">Aún no has creado ninguna regla.</p>
      ) : (
        <ul class="lista-reglas">
          {usuario.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.contiene}</strong> → {nombre(r.categoriaId)}
                {r.campo === 'concepto' && <span class="secundario"> (concepto)</span>}
              </span>
              <button
                type="button"
                class="boton-icono"
                aria-label={`Borrar regla ${r.contiene}`}
                onClick={() => void app.actualizar((e) => borrarRegla(e, r.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <details class="reglas-defecto">
        <summary>Reglas por defecto ({porDefecto.length})</summary>
        <ul class="lista-reglas">
          {porDefecto.map((r) => (
            <li key={r.id}>
              <span>
                {r.contiene} → {nombre(r.categoriaId)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
