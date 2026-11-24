// Chart.js con solo las piezas que usa la app (se carga bajo demanda en Gráficas).
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
Chart.defaults.animation = false // más rápido y sin movimientos al cambiar de filtro

export { Chart }
