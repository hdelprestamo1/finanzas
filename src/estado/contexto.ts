import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { EstadoApp } from './tipos'

/** Lo que las pantallas pueden usar mientras la app está desbloqueada. */
export interface ContextoApp {
  estado: EstadoApp
  /** Aplica un cambio al estado, lo vuelve a cifrar y lo guarda. */
  actualizar(cambio: (estado: EstadoApp) => EstadoApp): Promise<void>
  bloquear(): void
  cambiarContrasena(actual: string, nueva: string): Promise<void>
  borrarTodo(): Promise<void>
}

export const Contexto = createContext<ContextoApp | null>(null)

export function useApp(): ContextoApp {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useApp() fuera de una sesión desbloqueada')
  return contexto
}
