import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import { Inicio } from './pantallas/inicio'
import { Movimientos } from './pantallas/movimientos'
import { Graficas } from './pantallas/graficas'
import { Deudas } from './pantallas/deudas'
import { Importar } from './pantallas/importar'
import { Ajustes } from './pantallas/ajustes'
import { Acceso } from './pantallas/acceso'
import { Icono, type NombreIcono } from './componentes/iconos'
import { Contexto, useApp, type ContextoApp } from './estado/contexto'
import type { EstadoApp } from './estado/tipos'
import * as boveda from './seguridad/boveda'
import { ordenarPorCadena } from './importador/orden'
import { useBloqueoAutomatico } from './seguridad/bloqueo-automatico'

interface Pestana {
  id: string
  titulo: string
  icono: NombreIcono
  Pantalla: ComponentType
}

const PESTANAS: Pestana[] = [
  { id: 'inicio', titulo: 'Inicio', icono: 'inicio', Pantalla: Inicio },
  { id: 'movimientos', titulo: 'Movimientos', icono: 'movimientos', Pantalla: Movimientos },
  { id: 'graficas', titulo: 'Gráficas', icono: 'graficas', Pantalla: Graficas },
  { id: 'deudas', titulo: 'Deudas', icono: 'deudas', Pantalla: Deudas },
  { id: 'importar', titulo: 'Importar', icono: 'importar', Pantalla: Importar },
  { id: 'ajustes', titulo: 'Ajustes', icono: 'ajustes', Pantalla: Ajustes },
]

type Fase =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'crear' }
  | { tipo: 'desbloquear' }
  | { tipo: 'abierta'; estado: EstadoApp }

export function App() {
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  // La sesión (con la clave) y el estado descifrado solo viven en memoria.
  const sesion = useRef<boveda.Sesion | null>(null)
  const estado = useRef<EstadoApp | null>(null)

  useEffect(() => {
    boveda.existeBoveda().then(
      (existe) => setFase({ tipo: existe ? 'desbloquear' : 'crear' }),
      () =>
        setFase({
          tipo: 'error',
          mensaje:
            'No se puede acceder al almacenamiento del navegador. Si estás en modo privado, abre la app en una ventana normal.',
        }),
    )
  }, [])

  const abrir = useCallback((nuevaSesion: boveda.Sesion, leido: EstadoApp) => {
    // Reparación: datos importados con versiones anteriores pueden tener un día
    // desordenado; se ordena por la cadena de saldos y se guarda (solo cambia el orden).
    const ordenados = ordenarPorCadena(leido.movimientos)
    const cambia = ordenados.some((m, i) => m !== leido.movimientos[i])
    const nuevoEstado = cambia ? { ...leido, movimientos: ordenados } : leido
    sesion.current = nuevaSesion
    estado.current = nuevoEstado
    setFase({ tipo: 'abierta', estado: nuevoEstado })
    if (cambia) void boveda.guardarEstado(nuevaSesion, nuevoEstado)
  }, [])

  // Al bloquear se sueltan las referencias a la clave y a los datos descifrados.
  const bloquear = useCallback(() => {
    sesion.current = null
    estado.current = null
    setFase({ tipo: 'desbloquear' })
  }, [])

  const contexto = useMemo<ContextoApp | null>(() => {
    if (fase.tipo !== 'abierta') return null
    return {
      estado: fase.estado,
      async actualizar(cambio) {
        if (!sesion.current || !estado.current) throw new Error('La app está bloqueada')
        const nuevo = cambio(estado.current)
        estado.current = nuevo
        setFase({ tipo: 'abierta', estado: nuevo })
        await boveda.guardarEstado(sesion.current, nuevo)
      },
      bloquear,
      async cambiarContrasena(actual, nueva) {
        if (!estado.current) throw new Error('La app está bloqueada')
        sesion.current = await boveda.cambiarContrasena(actual, nueva, estado.current)
      },
      async borrarTodo() {
        await boveda.borrarTodo()
        sesion.current = null
        estado.current = null
        setFase({ tipo: 'crear' })
      },
    }
  }, [fase, bloquear])

  switch (fase.tipo) {
    case 'cargando':
      return null
    case 'error':
      return (
        <div class="acceso">
          <p class="error">{fase.mensaje}</p>
        </div>
      )
    case 'crear':
    case 'desbloquear':
      return (
        <Acceso
          modo={fase.tipo}
          alAbrir={abrir}
          alBorrarTodo={async () => {
            await boveda.borrarTodo()
            setFase({ tipo: 'crear' })
          }}
        />
      )
    case 'abierta':
      return (
        <Contexto.Provider value={contexto}>
          <Principal />
        </Contexto.Provider>
      )
  }
}

function pestanaDesdeHash(): string {
  const id = location.hash.replace(/^#\/?/, '')
  return PESTANAS.some((p) => p.id === id) ? id : 'inicio'
}

function Principal() {
  const [activa, setActiva] = useState(pestanaDesdeHash)
  const contexto = useApp()
  useBloqueoAutomatico(contexto.estado.ajustes.minutosBloqueo, contexto.bloquear)

  useEffect(() => {
    const alCambiar = () => setActiva(pestanaDesdeHash())
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  const actual = PESTANAS.find((p) => p.id === activa)!
  const { Pantalla } = actual

  return (
    <div class="app">
      <header class="cabecera">
        <h1>{actual.titulo}</h1>
        <button
          type="button"
          class="boton-icono"
          onClick={contexto.bloquear}
          aria-label="Bloquear"
          title="Bloquear"
        >
          <Icono nombre="candado" />
        </button>
      </header>
      <main class="contenido">
        <Pantalla />
      </main>
      <nav class="pestanas" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <a
            key={p.id}
            href={`#/${p.id}`}
            class={p.id === activa ? 'pestana activa' : 'pestana'}
            aria-current={p.id === activa ? 'page' : undefined}
          >
            <Icono nombre={p.icono} />
            <span>{p.titulo}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
