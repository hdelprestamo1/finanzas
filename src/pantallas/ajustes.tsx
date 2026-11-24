import { useEffect, useState } from 'preact/hooks'

export function Ajustes() {
  const [persistente, setPersistente] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersistente, () => setPersistente(false))
  }, [])

  return (
    <>
      <section class="tarjeta">
        <h2>Aplicación</h2>
        <dl class="datos">
          <dt>Versión</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt>Almacenamiento persistente</dt>
          <dd>{persistente === null ? '…' : persistente ? 'Concedido' : 'No concedido'}</dd>
        </dl>
      </section>
      <section class="tarjeta vacia">
        <p class="secundario">
          Contraseña, categorías, copias de seguridad y «Buscar actualización» llegan en las
          siguientes fases.
        </p>
      </section>
    </>
  )
}
