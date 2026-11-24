import { useState } from 'preact/hooks'
import * as boveda from '../seguridad/boveda'
import { estadoInicial, type EstadoApp } from '../estado/tipos'
import { BorrarTodo } from '../componentes/borrar-todo'

interface Props {
  modo: 'crear' | 'desbloquear'
  alAbrir: (sesion: boveda.Sesion, estado: EstadoApp) => void
  alBorrarTodo: () => Promise<void>
}

export function Acceso({ modo, alAbrir, alBorrarTodo }: Props) {
  return (
    <div class="acceso">
      <div class="acceso-logo" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1>Finanzas</h1>
      {modo === 'crear' ? (
        <CrearContrasena alAbrir={alAbrir} />
      ) : (
        <Desbloquear alAbrir={alAbrir} alBorrarTodo={alBorrarTodo} />
      )}
    </div>
  )
}

function CrearContrasena({ alAbrir }: Pick<Props, 'alAbrir'>) {
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [entendido, setEntendido] = useState(false)
  const [mostrar, setMostrar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const longitud = [...contrasena].length
  const corta = longitud < boveda.LONGITUD_MINIMA_CONTRASENA
  const distintas = repetida !== '' && repetida !== contrasena
  const valido = !corta && repetida === contrasena && entendido

  return (
    <form
      class="formulario"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valido) return
        setOcupado(true)
        setError('')
        try {
          const estado = estadoInicial()
          const sesion = await boveda.crearBoveda(contrasena, estado)
          alAbrir(sesion, estado)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se ha podido crear la contraseña')
          setOcupado(false)
        }
      }}
    >
      <h2>Crea tu contraseña</h2>
      <p class="secundario">
        Cifra todos tus datos en este dispositivo. Mínimo {boveda.LONGITUD_MINIMA_CONTRASENA}{' '}
        caracteres; mejor una frase fácil de recordar.
      </p>
      <div class="aviso">
        <strong>Si la olvidas, los datos no se pueden recuperar.</strong> Nadie puede
        restablecerla: ni la app, ni el banco, ni nadie.
      </div>
      <label>
        Contraseña
        <CampoContrasena mostrar={mostrar} valor={contrasena} alCambiar={setContrasena} autofocus />
        <span class={corta && longitud > 0 ? 'ayuda error' : 'ayuda'}>
          {longitud} / {boveda.LONGITUD_MINIMA_CONTRASENA} caracteres mínimo
        </span>
      </label>
      <label>
        Repite la contraseña
        <CampoContrasena mostrar={mostrar} valor={repetida} alCambiar={setRepetida} />
        {distintas && <span class="ayuda error">No coinciden</span>}
      </label>
      <label class="casilla">
        <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.currentTarget.checked)} />
        Mostrar contraseña
      </label>
      <label class="casilla">
        <input
          type="checkbox"
          checked={entendido}
          onChange={(e) => setEntendido(e.currentTarget.checked)}
        />
        Entiendo que si olvido la contraseña perderé los datos
      </label>
      {error && <p class="error">{error}</p>}
      <button type="submit" class="boton principal" disabled={!valido || ocupado}>
        {ocupado ? 'Creando…' : 'Crear y entrar'}
      </button>
    </form>
  )
}

function Desbloquear({ alAbrir, alBorrarTodo }: Omit<Props, 'modo'>) {
  const [contrasena, setContrasena] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [olvidada, setOlvidada] = useState(false)

  return (
    <>
      <form
        class="formulario"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!contrasena) return
          setOcupado(true)
          setError('')
          try {
            const { sesion, estado } = await boveda.desbloquear(contrasena)
            alAbrir(sesion, estado)
          } catch (err) {
            setError(
              err instanceof boveda.ContrasenaIncorrecta
                ? 'Contraseña incorrecta'
                : 'No se han podido leer los datos',
            )
            setContrasena('')
            setOcupado(false)
          }
        }}
      >
        <label>
          Contraseña
          <input
            type="password"
            value={contrasena}
            onInput={(e) => setContrasena(e.currentTarget.value)}
            autocomplete="current-password"
            autofocus
          />
        </label>
        {error && <p class="error">{error}</p>}
        <button type="submit" class="boton principal" disabled={!contrasena || ocupado}>
          {ocupado ? 'Comprobando…' : 'Desbloquear'}
        </button>
      </form>

      {olvidada ? (
        <div class="formulario">
          <p class="secundario">
            La contraseña no se puede recuperar. La única opción es borrar los datos de este
            dispositivo y empezar de cero (o restaurar después una copia de seguridad, que necesita
            la contraseña con la que se hizo).
          </p>
          <BorrarTodo alBorrar={alBorrarTodo} />
        </div>
      ) : (
        <button type="button" class="enlace" onClick={() => setOlvidada(true)}>
          ¿Has olvidado la contraseña?
        </button>
      )}
    </>
  )
}

/** Campo de contraseña nueva que puede mostrarse en claro. */
function CampoContrasena(props: {
  mostrar: boolean
  valor: string
  alCambiar: (valor: string) => void
  autofocus?: boolean
}) {
  const comunes = {
    value: props.valor,
    onInput: (e: Event) => props.alCambiar((e.currentTarget as HTMLInputElement).value),
    autocomplete: 'new-password' as const,
    autocapitalize: 'off' as const,
    spellcheck: false,
    autofocus: props.autofocus,
  }
  return props.mostrar ? <input type="text" {...comunes} /> : <input type="password" {...comunes} />
}
