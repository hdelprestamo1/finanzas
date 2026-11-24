// Marcador para las pantallas que se implementan en fases posteriores.
export function PantallaVacia({ fase, texto }: { fase: number; texto: string }) {
  return (
    <section class="tarjeta vacia">
      <p>{texto}</p>
      <p class="secundario">Llega en la fase {fase}.</p>
    </section>
  )
}
