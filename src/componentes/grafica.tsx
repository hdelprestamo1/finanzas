import { useEffect, useRef, useState } from 'preact/hooks'
import type { Chart as TipoChart, ChartConfiguration, ChartType } from 'chart.js'

/** Colores leídos de las variables CSS (cambian con el modo claro/oscuro). */
export interface Colores {
  texto: string
  texto2: string
  texto3: string
  superficie: string
  ingreso: string
  gasto: string
  saldo: string
  resto: string
  rejilla: string
  eje: string
  ejeTexto: string
}

function leerColores(): Colores {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    texto: v('--texto'),
    texto2: v('--texto-2'),
    texto3: v('--texto-3'),
    superficie: v('--superficie'),
    ingreso: v('--serie-ingreso'),
    gasto: v('--serie-gasto'),
    saldo: v('--serie-saldo'),
    resto: v('--serie-resto'),
    rejilla: v('--rejilla'),
    eje: v('--eje'),
    ejeTexto: v('--eje-texto'),
  }
}

/** Cambia cuando el sistema pasa de modo claro a oscuro, para repintar. */
function useTema(): number {
  const [tema, setTema] = useState(0)
  useEffect(() => {
    const consulta = matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => setTema((t) => t + 1)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])
  return tema
}

/**
 * Lienzo de Chart.js. `crear` devuelve la configuración a partir de los colores;
 * la gráfica se rehace cuando cambia `clave` (los datos) o el tema.
 */
export function Grafica<T extends ChartType>(props: {
  crear: (colores: Colores) => ChartConfiguration<T>
  clave: string
  alto: number
  descripcion: string
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const grafica = useRef<TipoChart<T> | null>(null)
  const tema = useTema()
  const crear = useRef(props.crear)
  crear.current = props.crear

  useEffect(() => {
    let cancelado = false
    void import('../graficas/chart').then(({ Chart }) => {
      if (cancelado || !lienzo.current) return
      grafica.current?.destroy()
      grafica.current = new Chart(lienzo.current, crear.current(leerColores()))
    })
    return () => {
      cancelado = true
      grafica.current?.destroy()
      grafica.current = null
    }
  }, [props.clave, tema])

  return (
    <div class="lienzo" style={{ height: `${props.alto}px` }}>
      <canvas ref={lienzo} role="img" aria-label={props.descripcion} />
    </div>
  )
}
