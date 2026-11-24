import { useEffect, useState } from 'preact/hooks'
import type { ComponentType } from 'preact'
import { Inicio } from './pantallas/inicio'
import { Movimientos } from './pantallas/movimientos'
import { Graficas } from './pantallas/graficas'
import { Deudas } from './pantallas/deudas'
import { Importar } from './pantallas/importar'
import { Ajustes } from './pantallas/ajustes'
import { Icono, type NombreIcono } from './componentes/iconos'

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

function pestanaDesdeHash(): string {
  const id = location.hash.replace(/^#\/?/, '')
  return PESTANAS.some((p) => p.id === id) ? id : 'inicio'
}

export function App() {
  const [activa, setActiva] = useState(pestanaDesdeHash)

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
