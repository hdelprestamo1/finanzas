import { useEffect, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import { BorrarTodo } from '../componentes/borrar-todo'
import { Categorias, Reglas } from '../componentes/categorias-ajustes'
import { ContrasenaIncorrecta, LONGITUD_MINIMA_CONTRASENA } from '../seguridad/boveda'
import { normalizar } from '../utilidades/texto'

const OPCIONES_BLOQUEO = [1, 2, 5, 10, 15, 30]

export function Ajustes() {
  const app = useApp()

  return (
    <>
      <MiNombre />

      <Categorias />

      <Reglas />

      <section class="tarjeta">
        <h2>Seguridad</h2>
        <label class="fila">
          <span>Bloquear tras</span>
          <select
            value={app.estado.ajustes.minutosBloqueo}
            onChange={(e) => {
              const minutos = Number(e.currentTarget.value)
              void app.actualizar((estado) => ({
                ...estado,
                ajustes: { ...estado.ajustes, minutosBloqueo: minutos },
              }))
            }}
          >
            {OPCIONES_BLOQUEO.map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? 'minuto' : 'minutos'}
              </option>
            ))}
          </select>
        </label>
        <p class="secundario">
          Sin actividad, o en segundo plano, durante ese tiempo. Al bloquear se borran de la
          memoria la clave y los datos descifrados.
        </p>
        <button type="button" class="boton" onClick={app.bloquear}>
          Bloquear ahora
        </button>
      </section>

      <CambiarContrasena />

      <InfoAplicacion />

      <section class="tarjeta">
        <h2>Borrar datos</h2>
        <p class="secundario">Elimina todo lo guardado en este dispositivo.</p>
        <BorrarTodo alBorrar={app.borrarTodo} />
      </section>
    </>
  )
}

/** Nombres con los que aparece el usuario en los Bizum: se ignoran al emparejar (§7, §8.3). */
function MiNombre() {
  const app = useApp()
  const [nuevo, setNuevo] = useState('')
  const nombres = app.estado.ajustes.miNombre

  function guardar(lista: string[]) {
    void app.actualizar((estado) => ({ ...estado, ajustes: { ...estado.ajustes, miNombre: lista } }))
  }

  return (
    <section class="tarjeta">
      <h2>Mi nombre</h2>
      <p class="secundario">
        Cómo apareces tú en los textos de Bizum (por ejemplo, tu nombre de pila). Estos nombres
        nunca se confundirán con otra persona al emparejar deudas.
      </p>
      {nombres.length > 0 && (
        <ul class="etiquetas">
          {nombres.map((n) => (
            <li key={n}>
              {n}
              <button
                type="button"
                aria-label={`Quitar ${n}`}
                onClick={() => guardar(nombres.filter((x) => x !== n))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="fila-formulario"
        onSubmit={(e) => {
          e.preventDefault()
          const limpio = nuevo.trim().replace(/\s+/g, ' ')
          if (!limpio) return
          if (!nombres.some((n) => normalizar(n) === normalizar(limpio))) guardar([...nombres, limpio])
          setNuevo('')
        }}
      >
        <input
          type="text"
          value={nuevo}
          onInput={(e) => setNuevo(e.currentTarget.value)}
          placeholder="Añadir nombre"
          aria-label="Añadir nombre"
          autocomplete="off"
        />
        <button type="submit" class="boton" disabled={!nuevo.trim()}>
          Añadir
        </button>
      </form>
    </section>
  )
}

function CambiarContrasena() {
  const app = useApp()
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const corta = [...nueva].length < LONGITUD_MINIMA_CONTRASENA
  const valido = actual !== '' && !corta && nueva === repetida

  function cerrar() {
    setAbierto(false)
    setActual('')
    setNueva('')
    setRepetida('')
  }

  return (
    <section class="tarjeta">
      <h2>Contraseña</h2>
      {mensaje && <p class={mensaje.tipo === 'ok' ? 'exito' : 'error'}>{mensaje.texto}</p>}
      {!abierto ? (
        <button
          type="button"
          class="boton"
          onClick={() => {
            setMensaje(null)
            setAbierto(true)
          }}
        >
          Cambiar contraseña
        </button>
      ) : (
        <form
          class="formulario"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!valido) return
            setOcupado(true)
            setMensaje(null)
            try {
              await app.cambiarContrasena(actual, nueva)
              cerrar()
              setMensaje({
                tipo: 'ok',
                texto:
                  'Contraseña cambiada. Las copias de seguridad antiguas siguen usando la contraseña anterior.',
              })
            } catch (err) {
              setMensaje({
                tipo: 'error',
                texto:
                  err instanceof ContrasenaIncorrecta
                    ? 'La contraseña actual no es correcta'
                    : 'No se ha podido cambiar la contraseña',
              })
            } finally {
              setOcupado(false)
            }
          }}
        >
          <label>
            Contraseña actual
            <input
              type="password"
              value={actual}
              onInput={(e) => setActual(e.currentTarget.value)}
              autocomplete="current-password"
            />
          </label>
          <label>
            Contraseña nueva
            <input
              type="password"
              value={nueva}
              onInput={(e) => setNueva(e.currentTarget.value)}
              autocomplete="new-password"
            />
            {nueva !== '' && corta && (
              <span class="ayuda error">Mínimo {LONGITUD_MINIMA_CONTRASENA} caracteres</span>
            )}
          </label>
          <label>
            Repite la nueva
            <input
              type="password"
              value={repetida}
              onInput={(e) => setRepetida(e.currentTarget.value)}
              autocomplete="new-password"
            />
            {repetida !== '' && repetida !== nueva && <span class="ayuda error">No coinciden</span>}
          </label>
          <div class="botones">
            <button type="button" class="boton" onClick={cerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" class="boton principal" disabled={!valido || ocupado}>
              {ocupado ? 'Cambiando…' : 'Cambiar'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function InfoAplicacion() {
  const [persistente, setPersistente] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersistente, () => setPersistente(false))
  }, [])

  return (
    <section class="tarjeta">
      <h2>Aplicación</h2>
      <dl class="datos">
        <dt>Versión</dt>
        <dd>{__APP_VERSION__}</dd>
        <dt>Almacenamiento persistente</dt>
        <dd>{persistente === null ? '…' : persistente ? 'Concedido' : 'No concedido'}</dd>
      </dl>
      <p class="secundario">Copias de seguridad y «Buscar actualización» llegan en fases posteriores.</p>
    </section>
  )
}
