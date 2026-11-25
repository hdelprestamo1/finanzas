import { useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import type { Movimiento, Persona } from '../estado/tipos'
import { buscarPersonas, crearPersona } from '../personas/operaciones'
import { asignarMovimiento } from '../deudas/operaciones'
import { textoParaAlias } from '../deudas/emparejado'
import { normalizar } from '../utilidades/texto'

/** Avatar redondo con las iniciales de una persona. */
export function AvatarPersona({ nombre }: { nombre: string }) {
  const iniciales =
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  return (
    <span class="avatar avatar-persona" aria-hidden="true">
      {iniciales}
    </span>
  )
}

/**
 * Búsqueda rápida de personas (§10.1). Si no existe, ofrece crearla con ese nombre.
 * Llama a `alElegir` con la persona elegida o recién creada.
 */
export function SelectorPersona(props: {
  alElegir: (persona: Persona) => void
  placeholder?: string
  autofocus?: boolean
}) {
  const app = useApp()
  const [texto, setTexto] = useState('')
  const resultados = buscarPersonas(app.estado.personas, texto)
  const exacta = resultados.some((p) => normalizar(p.nombre) === normalizar(texto))

  return (
    <div class="selector-persona">
      <input
        type="search"
        value={texto}
        onInput={(e) => setTexto(e.currentTarget.value)}
        placeholder={props.placeholder ?? 'Buscar o escribir un nombre'}
        aria-label="Persona"
        autocomplete="off"
        autofocus={props.autofocus}
      />
      {texto.trim() !== '' && (
        <ul class="opciones">
          {resultados.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => props.alElegir(p)}>
                <AvatarPersona nombre={p.nombre} />
                <span>{p.nombre}</span>
              </button>
            </li>
          ))}
          {!exacta && (
            <li>
              <button
                type="button"
                class="crear"
                onClick={() => {
                  let creada: Persona | undefined
                  void app
                    .actualizar((e) => {
                      const r = crearPersona(e, texto)
                      creada = r.persona
                      return r.estado
                    })
                    .then(() => creada && props.alElegir(creada))
                }}
              >
                <span class="avatar avatar-mas" aria-hidden="true">
                  +
                </span>
                <span>
                  Crear «{texto.trim()}»
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Asignar un movimiento a una persona, con la opción de recordar su texto como alias
 * («Recordar que '[texto]' es de [persona]», §10.3).
 */
export function AsignarPersona(props: { movimiento: Movimiento; alTerminar: () => void }) {
  const app = useApp()
  const propuesto = textoParaAlias(props.movimiento)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [recordar, setRecordar] = useState(false)
  const [alias, setAlias] = useState(propuesto ?? '')

  if (!persona) {
    return (
      <div class="asignar-persona">
        <SelectorPersona alElegir={setPersona} autofocus />
        <button type="button" class="enlace" onClick={props.alTerminar}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <form
      class="asignar-persona"
      onSubmit={(e) => {
        e.preventDefault()
        void app.actualizar((est) =>
          asignarMovimiento(est, props.movimiento.id, persona.id, recordar ? alias : undefined),
        )
        props.alTerminar()
      }}
    >
      <p>
        Asignar a <strong>{persona.nombre}</strong>
      </p>
      {propuesto && (
        <>
          <label class="casilla">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.currentTarget.checked)} />
            Recordar que este texto es de {persona.nombre}
          </label>
          {recordar && (
            <input
              type="text"
              value={alias}
              onInput={(e) => setAlias(e.currentTarget.value)}
              aria-label="Texto a recordar"
              autocomplete="off"
            />
          )}
        </>
      )}
      <div class="botones">
        <button type="button" class="boton" onClick={() => setPersona(null)}>
          Cambiar
        </button>
        <button type="submit" class="boton principal" disabled={recordar && !alias.trim()}>
          Asignar
        </button>
      </div>
    </form>
  )
}
