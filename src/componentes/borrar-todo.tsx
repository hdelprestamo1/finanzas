import { useState } from 'preact/hooks'

const PALABRA_CONFIRMACION = 'BORRAR'

/** Borrado total con doble confirmación: pulsar el botón y escribir BORRAR. */
export function BorrarTodo({ alBorrar }: { alBorrar: () => Promise<void> }) {
  const [paso, setPaso] = useState<0 | 1>(0)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)

  if (paso === 0) {
    return (
      <button type="button" class="boton peligro" onClick={() => setPaso(1)}>
        Borrar todos los datos
      </button>
    )
  }

  return (
    <form
      class="formulario confirmar-borrado"
      onSubmit={async (e) => {
        e.preventDefault()
        if (texto.trim() !== PALABRA_CONFIRMACION) return
        setOcupado(true)
        try {
          await alBorrar()
        } finally {
          setOcupado(false)
        }
      }}
    >
      <p>
        Se borrarán <strong>todos</strong> los movimientos, deudas, personas y ajustes de este
        dispositivo. <strong>No se puede deshacer.</strong> Solo podrás recuperarlos con una copia
        de seguridad.
      </p>
      <label>
        Escribe {PALABRA_CONFIRMACION} para confirmar
        <input
          type="text"
          value={texto}
          onInput={(e) => setTexto(e.currentTarget.value)}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck={false}
        />
      </label>
      <div class="botones">
        <button
          type="button"
          class="boton"
          onClick={() => {
            setPaso(0)
            setTexto('')
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="boton peligro"
          disabled={ocupado || texto.trim() !== PALABRA_CONFIRMACION}
        >
          Borrar definitivamente
        </button>
      </div>
    </form>
  )
}
