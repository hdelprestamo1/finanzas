import { useMemo, useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import type { Deuda, Persona } from '../estado/tipos'
import { historialPersona, personasConSaldo, saldoPersona } from '../deudas/saldos'
import { bizumEnviadosSinAsignar, DIAS_BIZUM_SIN_ASIGNAR } from '../deudas/emparejado'
import {
  crearDeuda,
  descartarMovimiento,
  eliminarDeuda,
  eliminarPago,
  marcarSaldada,
} from '../deudas/operaciones'
import { agregarAlias, quitarAlias, renombrarPersona } from '../personas/operaciones'
import { AsignarPersona, AvatarPersona, SelectorPersona } from '../componentes/personas'
import { PreguntasEmparejado } from '../componentes/preguntas-emparejado'
import { euros, eurosConSigno, fechaCorta } from '../utilidades/formato'
import { hoyISO, leerImporteUsuario } from '../utilidades/importe'

type Vista = { tipo: 'lista' } | { tipo: 'persona'; id: string } | { tipo: 'nueva'; personaId?: string }

export function Deudas() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const irA = (v: Vista) => {
    setVista(v)
    window.scrollTo(0, 0)
  }

  if (vista.tipo === 'persona') {
    return (
      <FichaPersona
        id={vista.id}
        alVolver={() => irA({ tipo: 'lista' })}
        alNuevaDeuda={() => irA({ tipo: 'nueva', personaId: vista.id })}
      />
    )
  }
  if (vista.tipo === 'nueva') {
    return (
      <NuevaDeuda
        personaId={vista.personaId}
        alCancelar={() => irA(vista.personaId ? { tipo: 'persona', id: vista.personaId } : { tipo: 'lista' })}
        alGuardar={(personaId) => irA({ tipo: 'persona', id: personaId })}
      />
    )
  }
  return (
    <ListaDeudas
      alAbrir={(id) => irA({ tipo: 'persona', id })}
      alNuevaDeuda={() => irA({ tipo: 'nueva' })}
    />
  )
}

/** "Te debe 40,00 €" / "Le debes 10,00 €" / "Al día" */
export function TextoSaldo({ saldo }: { saldo: number }) {
  if (saldo > 0) return <span class="ingreso">Te debe {euros(saldo)}</span>
  if (saldo < 0) return <span class="gasto">Le debes {euros(-saldo)}</span>
  return <span class="secundario">Al día</span>
}

// --- Lista principal --------------------------------------------------------------------

function ListaDeudas(props: { alAbrir: (id: string) => void; alNuevaDeuda: () => void }) {
  const { estado } = useApp()
  const conSaldo = useMemo(() => personasConSaldo(estado), [estado])
  const teDeben = conSaldo.filter((x) => x.saldo > 0).reduce((s, x) => s + x.saldo, 0)
  const debes = conSaldo.filter((x) => x.saldo < 0).reduce((s, x) => s - x.saldo, 0)

  return (
    <>
      <section class="cifras cifras-2">
        <div class="cifra">
          <span class="cifra-etiqueta">Te deben</span>
          <span class="cifra-valor ingreso">{euros(teDeben)}</span>
        </div>
        <div class="cifra">
          <span class="cifra-etiqueta">Debes</span>
          <span class="cifra-valor gasto">{euros(debes)}</span>
        </div>
      </section>

      <button type="button" class="boton principal boton-ancho" onClick={props.alNuevaDeuda}>
        Nueva deuda
      </button>

      <PreguntasEmparejado />

      <section class="tarjeta">
        <h2>Pendientes</h2>
        {conSaldo.length === 0 ? (
          <p class="secundario">Nadie te debe nada y no debes nada a nadie.</p>
        ) : (
          <ul class="lista-personas">
            {conSaldo.map(({ persona, saldo }) => (
              <li key={persona.id}>
                <button type="button" class="fila-persona" onClick={() => props.alAbrir(persona.id)}>
                  <AvatarPersona nombre={persona.nombre} />
                  <span class="nombre">{persona.nombre}</span>
                  <TextoSaldo saldo={saldo} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BizumSinAsignar />

      <section class="tarjeta">
        <h2>Todas las personas</h2>
        <p class="secundario">
          {estado.personas.length} en total. Importa tus contactos en <a href="#/importar">Importar</a>.
        </p>
        <SelectorPersona alElegir={(p) => props.alAbrir(p.id)} />
      </section>
    </>
  )
}

function BizumSinAsignar() {
  const app = useApp()
  const lista = useMemo(() => bizumEnviadosSinAsignar(app.estado, hoyISO()), [app.estado])
  const [asignando, setAsignando] = useState<string | null>(null)
  if (lista.length === 0) return null

  return (
    <section class="tarjeta">
      <h2>Bizum enviados sin asignar</h2>
      <p class="secundario">Últimos {DIAS_BIZUM_SIN_ASIGNAR} días. Asígnalos a una persona o descártalos.</p>
      <ul class="movimientos">
        {lista.map((m) => (
          <li key={m.id} class="bizum-sin-asignar">
            <div class="fila-bizum">
              <div class="mov-texto">
                <span class="mov-concepto">{m.textoLibre ?? 'Sin texto'}</span>
                <span class="mov-detalle">{fechaCorta(m.fecha)}</span>
              </div>
              <span class="mov-importe">{eurosConSigno(m.importe)}</span>
            </div>
            {asignando === m.id ? (
              <AsignarPersona movimiento={m} alTerminar={() => setAsignando(null)} />
            ) : (
              <div class="botones">
                <button
                  type="button"
                  class="boton boton-pequeno"
                  onClick={() => void app.actualizar((e) => descartarMovimiento(e, m.id))}
                >
                  Descartar
                </button>
                <button type="button" class="boton boton-pequeno" onClick={() => setAsignando(m.id)}>
                  Asignar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- Ficha de persona -----------------------------------------------------------------------

function FichaPersona(props: { id: string; alVolver: () => void; alNuevaDeuda: () => void }) {
  const app = useApp()
  const persona = app.estado.personas.find((p) => p.id === props.id)
  const [confirmando, setConfirmando] = useState<string | null>(null) // id de lo que se va a borrar
  const [editandoNombre, setEditandoNombre] = useState(false)
  if (!persona) return null

  const saldo = saldoPersona(app.estado, persona.id)
  const historial = historialPersona(app.estado, persona.id)
  const movimientos = new Map(app.estado.movimientos.map((m) => [m.id, m]))

  return (
    <>
      <button type="button" class="enlace volver" onClick={props.alVolver}>
        ‹ Deudas
      </button>

      <section class="ficha-persona">
        <AvatarPersona nombre={persona.nombre} />
        {editandoNombre ? (
          <EditarNombre persona={persona} alTerminar={() => setEditandoNombre(false)} />
        ) : (
          <button type="button" class="nombre-persona" onClick={() => setEditandoNombre(true)}>
            {persona.nombre}
          </button>
        )}
        <p class="saldo-persona">
          <TextoSaldo saldo={saldo} />
        </p>
      </section>

      <div class="botones botones-ficha">
        {saldo !== 0 &&
          (confirmando === 'saldar' ? (
            <button
              type="button"
              class="boton"
              onClick={() => {
                void app.actualizar((e) => marcarSaldada(e, persona.id, hoyISO()))
                setConfirmando(null)
              }}
            >
              Confirmar: {saldo > 0 ? 'me ha pagado' : 'le he pagado'} {euros(Math.abs(saldo))}
            </button>
          ) : (
            <button type="button" class="boton" onClick={() => setConfirmando('saldar')}>
              Marcar como saldada
            </button>
          ))}
        <button type="button" class="boton principal" onClick={props.alNuevaDeuda}>
          Nueva deuda
        </button>
      </div>

      <section class="tarjeta">
        <h2>Historial</h2>
        {historial.length === 0 ? (
          <p class="secundario">Sin deudas ni pagos.</p>
        ) : (
          <ul class="movimientos historial">
            {historial.map((h) => {
              const id = h.tipo === 'deuda' ? h.deuda.id : h.pago.id
              const fecha = h.tipo === 'deuda' ? h.deuda.fecha : h.pago.fecha
              const mov = h.tipo === 'pago' && h.pago.movimientoId ? movimientos.get(h.pago.movimientoId) : undefined
              return (
                <li key={id}>
                  <div class="mov-texto">
                    <span class="mov-concepto">
                      {h.tipo === 'deuda'
                        ? `${h.deuda.direccion === 'me_debe' ? 'Me debe' : 'Le debo'}: ${h.deuda.concepto || 'sin concepto'}`
                        : h.pago.importe > 0
                          ? 'Me ha pagado'
                          : 'Le he pagado'}
                    </span>
                    <span class="mov-detalle">
                      {fechaCorta(fecha)}
                      {h.tipo === 'pago' &&
                        (h.pago.manual ? ' · a mano' : ` · ${mov?.textoLibre ?? mov?.tipo ?? 'banco'}`)}
                    </span>
                  </div>
                  <span class="mov-importe">{importeHistorial(h)}</span>
                  {confirmando === id ? (
                    <button
                      type="button"
                      class="boton boton-pequeno peligro relleno"
                      onClick={() => {
                        void app.actualizar((e) =>
                          h.tipo === 'deuda' ? eliminarDeuda(e, id) : eliminarPago(e, id),
                        )
                        setConfirmando(null)
                      }}
                    >
                      Eliminar
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="boton-icono"
                      aria-label="Eliminar"
                      onClick={() => setConfirmando(id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Alias persona={persona} />

      {persona.telefonos.length > 0 && (
        <section class="tarjeta">
          <h2>Teléfonos</h2>
          <p class="secundario">{persona.telefonos.join(' · ')}</p>
        </section>
      )}
    </>
  )
}

/** Importe con el signo desde el punto de vista del saldo (+ aumenta lo que te deben). */
function importeHistorial(h: ReturnType<typeof historialPersona>[number]): string {
  if (h.tipo === 'deuda') {
    return h.deuda.direccion === 'me_debe' ? `+${euros(h.deuda.importe)}` : `−${euros(h.deuda.importe)}`
  }
  return h.pago.importe > 0 ? `−${euros(h.pago.importe)}` : `+${euros(-h.pago.importe)}`
}

function EditarNombre(props: { persona: Persona; alTerminar: () => void }) {
  const app = useApp()
  const [nombre, setNombre] = useState(props.persona.nombre)
  return (
    <form
      class="fila-formulario"
      onSubmit={(e) => {
        e.preventDefault()
        void app.actualizar((est) => renombrarPersona(est, props.persona.id, nombre))
        props.alTerminar()
      }}
    >
      <input
        type="text"
        value={nombre}
        onInput={(e) => setNombre(e.currentTarget.value)}
        aria-label="Nombre"
        autofocus
      />
      <button type="submit" class="boton" disabled={!nombre.trim()}>
        Guardar
      </button>
    </form>
  )
}

function Alias({ persona }: { persona: Persona }) {
  const app = useApp()
  const [nuevo, setNuevo] = useState('')
  return (
    <section class="tarjeta">
      <h2>Textos de sus Bizum</h2>
      <p class="secundario">
        Apodos o textos que suelen aparecer en sus Bizum o transferencias (p. ej. «Tiburon»). Sirven
        para sugerir que un Bizum es suyo.
      </p>
      {persona.aliasTexto.length > 0 && (
        <ul class="etiquetas">
          {persona.aliasTexto.map((a) => (
            <li key={a}>
              {a}
              <button
                type="button"
                aria-label={`Quitar ${a}`}
                onClick={() => void app.actualizar((e) => quitarAlias(e, persona.id, a))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="fila-formulario"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nuevo.trim()) return
          void app.actualizar((est) => agregarAlias(est, persona.id, nuevo))
          setNuevo('')
        }}
      >
        <input
          type="text"
          value={nuevo}
          onInput={(e) => setNuevo(e.currentTarget.value)}
          placeholder="Añadir texto"
          aria-label="Añadir texto"
          autocomplete="off"
        />
        <button type="submit" class="boton" disabled={!nuevo.trim()}>
          Añadir
        </button>
      </form>
    </section>
  )
}

// --- Nueva deuda ----------------------------------------------------------------------------

function NuevaDeuda(props: {
  personaId?: string
  alCancelar: () => void
  alGuardar: (personaId: string) => void
}) {
  const app = useApp()
  const [personaId, setPersonaId] = useState(props.personaId ?? null)
  const [direccion, setDireccion] = useState<Deuda['direccion']>('me_debe')
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const [fecha, setFecha] = useState(hoyISO)
  const persona = app.estado.personas.find((p) => p.id === personaId)
  const centimos = leerImporteUsuario(importe)
  const valido = !!persona && centimos !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha)

  return (
    <>
      <button type="button" class="enlace volver" onClick={props.alCancelar}>
        ‹ Cancelar
      </button>
      <form
        class="tarjeta formulario"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valido || !persona || centimos === null) return
          void app.actualizar((est) =>
            crearDeuda(est, { personaId: persona.id, direccion, importe: centimos, concepto, fecha }),
          )
          props.alGuardar(persona.id)
        }}
      >
        <h2>Nueva deuda</h2>

        <div class="campo">
          <span>Persona</span>
          {persona ? (
            <div class="persona-elegida">
              <AvatarPersona nombre={persona.nombre} />
              <span class="nombre">{persona.nombre}</span>
              <button type="button" class="enlace" onClick={() => setPersonaId(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <SelectorPersona alElegir={(p) => setPersonaId(p.id)} autofocus />
          )}
        </div>

        <div class="segmentado segmentado-ancho" role="group" aria-label="Dirección">
          <button type="button" aria-pressed={direccion === 'me_debe'} onClick={() => setDireccion('me_debe')}>
            Me debe
          </button>
          <button type="button" aria-pressed={direccion === 'le_debo'} onClick={() => setDireccion('le_debo')}>
            Le debo
          </button>
        </div>

        <label>
          Importe (€)
          <input
            type="text"
            inputMode="decimal"
            value={importe}
            onInput={(e) => setImporte(e.currentTarget.value)}
            placeholder="0,00"
            autocomplete="off"
          />
          {importe.trim() !== '' && centimos === null && (
            <span class="ayuda error">Escribe un importe mayor que 0, p. ej. 12,50</span>
          )}
        </label>

        <label>
          Concepto
          <input
            type="text"
            value={concepto}
            onInput={(e) => setConcepto(e.currentTarget.value)}
            placeholder="Cena, entradas…"
            autocomplete="off"
          />
        </label>

        <label>
          Fecha
          <input type="date" value={fecha} onInput={(e) => setFecha(e.currentTarget.value)} />
        </label>

        <button type="submit" class="boton principal" disabled={!valido}>
          Guardar
          {valido && centimos !== null && ` · ${direccion === 'me_debe' ? 'me debe' : 'le debo'} ${euros(centimos)}`}
        </button>
      </form>
    </>
  )
}
