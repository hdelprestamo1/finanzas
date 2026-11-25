import { useMemo, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import { preguntasPendientes, type Candidato, type Pregunta } from '../deudas/emparejado'
import { asignarMovimiento, descartarMovimiento } from '../deudas/operaciones'
import { euros, eurosConSigno, fechaCorta } from '../utilidades/formato'
import { AsignarPersona } from './personas'

/** Muestra la primera pregunta pendiente; al responderla aparece la siguiente (§10.3). */
export function PreguntasEmparejado() {
  const { estado } = useApp()
  const preguntas = useMemo(() => preguntasPendientes(estado), [estado])
  if (preguntas.length === 0) return null
  return (
    <section class="tarjeta pregunta-emparejado">
      <div class="titulo-con-filtro">
        <h2>¿Es un pago?</h2>
        {preguntas.length > 1 && <span class="contador">1 de {preguntas.length}</span>}
      </div>
      <TarjetaPregunta key={preguntas[0]!.movimiento.id} pregunta={preguntas[0]!} />
    </section>
  )
}

function textoSaldo(c: Candidato): string {
  return c.saldo > 0 ? `te debe ${euros(c.saldo)}` : `le debes ${euros(-c.saldo)}`
}

function TarjetaPregunta({ pregunta }: { pregunta: Pregunta }) {
  const app = useApp()
  const [otra, setOtra] = useState(false)
  const { movimiento: m, candidatos } = pregunta
  const recibido = m.importe > 0
  const tipo =
    m.tipo === 'bizum'
      ? `Bizum ${recibido ? 'recibido' : 'enviado'}`
      : `Transferencia ${recibido ? 'recibida' : 'enviada'}`
  const texto = m.textoLibre ?? m.nombreEnConcepto ?? 'sin texto'
  const unico = candidatos.length === 1 ? candidatos[0]! : null

  const asignar = (personaId: string) =>
    void app.actualizar((e) => asignarMovimiento(e, m.id, personaId))

  return (
    <div class="pregunta-cuerpo">
      <p class="pregunta-movimiento">
        {tipo},{' '}
        <strong class={recibido ? 'ingreso' : undefined}>{eurosConSigno(m.importe)}</strong> —{' '}
        <em>{texto}</em> ({fechaCorta(m.fecha)})
      </p>

      {otra ? (
        <AsignarPersona movimiento={m} alTerminar={() => setOtra(false)} />
      ) : unico ? (
        <>
          <p>
            ¿Es {recibido ? 'un pago de' : 'un pago a'} <strong>{unico.persona.nombre}</strong> (
            {textoSaldo(unico)})?
            {unico.fuerza === 'debil' && (
              <span class="secundario"> Coincide exactamente con lo pendiente.</span>
            )}
          </p>
          <div class="botones botones-pregunta">
            <button type="button" class="boton" onClick={() => setOtra(true)}>
              Es de otra persona…
            </button>
            <button
              type="button"
              class="boton"
              onClick={() => void app.actualizar((e) => descartarMovimiento(e, m.id))}
            >
              No
            </button>
            <button type="button" class="boton principal" onClick={() => asignar(unico.persona.id)}>
              Sí
            </button>
          </div>
        </>
      ) : (
        <>
          <p>¿De quién es?</p>
          <ul class="opciones-candidatos">
            {candidatos.map((c) => (
              <li key={c.persona.id}>
                <button type="button" class="boton" onClick={() => asignar(c.persona.id)}>
                  <span>{c.persona.nombre}</span>
                  <span class="secundario">{textoSaldo(c)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div class="botones botones-pregunta">
            <button type="button" class="boton" onClick={() => setOtra(true)}>
              Otra persona…
            </button>
            <button
              type="button"
              class="boton"
              onClick={() => void app.actualizar((e) => descartarMovimiento(e, m.id))}
            >
              Ninguna
            </button>
          </div>
        </>
      )}
    </div>
  )
}
