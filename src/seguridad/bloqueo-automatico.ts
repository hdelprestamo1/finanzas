// Bloqueo automático (§5.3): tras N minutos sin actividad, o al volver de
// segundo plano si ha pasado ese tiempo desde la última actividad.
import { useEffect } from 'preact/hooks'

const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
const INTERVALO_COMPROBACION_MS = 10_000

export function useBloqueoAutomatico(minutos: number, bloquear: () => void): void {
  useEffect(() => {
    const limite = minutos * 60_000
    let ultimaActividad = Date.now()

    const registrarActividad = () => {
      ultimaActividad = Date.now()
    }
    const comprobar = () => {
      if (Date.now() - ultimaActividad >= limite) bloquear()
    }
    // En segundo plano los temporizadores se congelan (sobre todo en iPhone):
    // por eso se comprueba también justo al volver a primer plano.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') comprobar()
    }

    for (const e of EVENTOS_ACTIVIDAD)
      window.addEventListener(e, registrarActividad, { passive: true, capture: true })
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('pageshow', comprobar)
    const intervalo = setInterval(comprobar, INTERVALO_COMPROBACION_MS)

    return () => {
      for (const e of EVENTOS_ACTIVIDAD)
        window.removeEventListener(e, registrarActividad, { capture: true })
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pageshow', comprobar)
      clearInterval(intervalo)
    }
  }, [minutos, bloquear])
}
