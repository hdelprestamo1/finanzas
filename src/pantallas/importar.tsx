import { useState } from 'preact/hooks'
import { useApp } from '../estado/contexto'
import {
  ErrorImportacion,
  aplicarImportacion,
  kutxabankExcel,
  preverImportacion,
  type PrevisionImportacion,
} from '../importador'
import { NOMBRE_TIPO, euros, eurosConSigno, fechaCorta } from '../utilidades/formato'
import { categoriaBasica } from '../categorias/porDefecto'
import type { TipoMovimiento } from '../estado/tipos'

type Paso =
  | { tipo: 'elegir' }
  | { tipo: 'leyendo'; nombre: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'previa'; prevision: PrevisionImportacion; nombre: string }
  | { tipo: 'guardando' }
  | { tipo: 'hecho'; nuevos: number; duplicados: number }

const fuente = kutxabankExcel

export function Importar() {
  const app = useApp()
  const [paso, setPaso] = useState<Paso>({ tipo: 'elegir' })

  async function alElegir(archivo: File) {
    setPaso({ tipo: 'leyendo', nombre: archivo.name })
    try {
      // El archivo se lee en memoria y se descarta: nunca se guarda (§5.2).
      const extracto = await fuente.leer(await archivo.arrayBuffer(), archivo.name)
      const prevision = preverImportacion(extracto, app.estado.movimientos)
      setPaso({ tipo: 'previa', prevision, nombre: archivo.name })
    } catch (err) {
      setPaso({
        tipo: 'error',
        mensaje:
          err instanceof ErrorImportacion
            ? err.message
            : 'No se ha podido leer el archivo. ¿Es el Excel de movimientos de Kutxabank?',
      })
    }
  }

  async function confirmar(prevision: PrevisionImportacion, nombre: string) {
    setPaso({ tipo: 'guardando' })
    try {
      await app.actualizar((estado) => {
        // Se recalcula sobre el estado actual por si ha cambiado desde la vista previa.
        const actual = preverImportacion(prevision.extracto, estado.movimientos)
        const { movimientos, importacion } = aplicarImportacion(actual, estado.movimientos, {
          importacionId: crypto.randomUUID(),
          nombreArchivo: nombre,
          fecha: new Date().toISOString(),
        })
        return { ...estado, movimientos, importaciones: [...estado.importaciones, importacion] }
      })
      setPaso({ tipo: 'hecho', nuevos: prevision.nuevos, duplicados: prevision.duplicados })
    } catch {
      setPaso({ tipo: 'error', mensaje: 'No se han podido guardar los movimientos.' })
    }
  }

  switch (paso.tipo) {
    case 'elegir':
      return <ElegirArchivo alElegir={alElegir} />
    case 'leyendo':
      return <p class="tarjeta vacia">Leyendo {paso.nombre}…</p>
    case 'guardando':
      return <p class="tarjeta vacia">Guardando…</p>
    case 'error':
      return (
        <>
          <section class="tarjeta">
            <h2>No se ha importado nada</h2>
            <p class="error">{paso.mensaje}</p>
          </section>
          <ElegirArchivo alElegir={alElegir} />
        </>
      )
    case 'hecho':
      return (
        <>
          <section class="tarjeta">
            <h2>Importación completada</h2>
            <p>
              {paso.nuevos} {paso.nuevos === 1 ? 'movimiento nuevo' : 'movimientos nuevos'}
              {paso.duplicados > 0 && ` · ${paso.duplicados} ya estaban importados`}.
            </p>
            <div class="aviso aviso-info">
              Recuerda exportar una <strong>copia de seguridad</strong> (llega en la fase 7).
            </div>
            <div class="botones">
              <a class="boton" href="#/movimientos">
                Ver movimientos
              </a>
              <button type="button" class="boton" onClick={() => setPaso({ tipo: 'elegir' })}>
                Importar otro
              </button>
            </div>
          </section>
        </>
      )
    case 'previa':
      return (
        <VistaPrevia
          prevision={paso.prevision}
          nombre={paso.nombre}
          alCancelar={() => setPaso({ tipo: 'elegir' })}
          alConfirmar={() => confirmar(paso.prevision, paso.nombre)}
        />
      )
  }
}

function ElegirArchivo({ alElegir }: { alElegir: (archivo: File) => void }) {
  return (
    <section class="tarjeta">
      <h2>Extracto de Kutxabank</h2>
      <p class="secundario">
        Descarga los movimientos en <strong>Excel</strong> desde la web de Kutxabank
        (archivo <code>movimientos_N.xls</code>) y elígelo aquí. Mejor periodos de días
        completos. El archivo se lee en este dispositivo y no se guarda.
      </p>
      <label class="boton principal selector-archivo">
        Elegir archivo
        <input
          type="file"
          accept={fuente.extensiones}
          onChange={(e) => {
            const archivo = e.currentTarget.files?.[0]
            e.currentTarget.value = '' // permite elegir otra vez el mismo archivo
            if (archivo) alElegir(archivo)
          }}
        />
      </label>
    </section>
  )
}

function VistaPrevia(props: {
  prevision: PrevisionImportacion
  nombre: string
  alCancelar: () => void
  alConfirmar: () => void
}) {
  const { prevision } = props
  const { extracto } = prevision
  const noReconocidos = prevision.filas.filter((f) => !f.leido.reconocido).length
  const categorias = useApp().estado.categorias
  const nombreCategoria = (tipo: TipoMovimiento, importe: number) => {
    const id = categoriaBasica(tipo, importe)
    return categorias.find((c) => c.id === id)?.nombre ?? id
  }

  return (
    <>
      <section class="tarjeta">
        <h2>Vista previa</h2>
        <p class="secundario nombre-archivo">{props.nombre}</p>
        <dl class="datos">
          <dt>Periodo</dt>
          <dd>
            {fechaCorta(extracto.periodoDesde)} – {fechaCorta(extracto.periodoHasta)}
          </dd>
          <dt>Saldo inicial</dt>
          <dd>{euros(extracto.saldoInicial)}</dd>
          <dt>Saldo final</dt>
          <dd>{euros(extracto.saldoFinal)}</dd>
          <dt>Movimientos</dt>
          <dd>{prevision.filas.length}</dd>
          <dt>Nuevos</dt>
          <dd>
            <strong>{prevision.nuevos}</strong>
          </dd>
          <dt>Ya importados</dt>
          <dd>{prevision.duplicados}</dd>
        </dl>
        <p class="exito comprobacion">✓ El saldo cuadra en todas las filas</p>
        {prevision.avisoContinuidad && <div class="aviso">{prevision.avisoContinuidad}</div>}
        {noReconocidos > 0 && (
          <div class="aviso">
            {noReconocidos === 1 ? 'Hay 1 movimiento' : `Hay ${noReconocidos} movimientos`} de{' '}
            <strong>tipo no reconocido</strong>. Se importarán como «Otros». Avisa para añadir ese
            tipo a la app.
          </div>
        )}
        <div class="botones">
          <button type="button" class="boton" onClick={props.alCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            class="boton principal"
            onClick={props.alConfirmar}
            disabled={prevision.nuevos === 0}
          >
            {prevision.nuevos === 0
              ? 'Nada nuevo que importar'
              : `Importar ${prevision.nuevos} ${prevision.nuevos === 1 ? 'movimiento' : 'movimientos'}`}
          </button>
        </div>
      </section>

      <section class="tarjeta lista-previa">
        <ul class="movimientos">
          {prevision.filas.map((f) => (
            <li key={f.id} class={f.duplicado ? 'duplicado' : undefined}>
              <div class="mov-texto">
                <span class="mov-concepto">{f.leido.concepto}</span>
                <span class="mov-detalle">
                  {fechaCorta(f.leido.fecha)} · {NOMBRE_TIPO[f.leido.tipo]} ·{' '}
                  {nombreCategoria(f.leido.tipo, f.leido.importe)}
                  {!f.leido.reconocido && <span class="marca">tipo no reconocido</span>}
                  {f.duplicado && <span class="marca neutra">ya importado</span>}
                </span>
              </div>
              <span class={f.leido.importe > 0 ? 'mov-importe ingreso' : 'mov-importe'}>
                {eurosConSigno(f.leido.importe)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
