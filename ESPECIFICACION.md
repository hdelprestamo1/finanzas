# Especificación — App de finanzas personales (PWA)

> Documento de partida para Claude Code. Léelo entero antes de escribir código.
> Nombre provisional de la app: **Finanzas** (el usuario puede cambiarlo).
> Versión del documento: **v2** — incluye el formato real del extracto de Kutxabank (PDF) y un extracto de ejemplo inventado para los tests (Apéndice A).

---

## 1. Objetivo

Aplicación de uso **estrictamente personal** para controlar ingresos, gastos y deudas con contactos, a partir de los extractos que el usuario descarga de su banco (Kutxabank, una sola cuenta con tarjeta de débito).

Debe funcionar en:
- **iPhone** (Safari → "Añadir a pantalla de inicio").
- **Ordenador Windows** (Chrome → "Instalar aplicación").

## 2. Principios no negociables

1. **Sin servidor.** Toda la lógica se ejecuta en el dispositivo. No hay backend, ni base de datos remota, ni APIs de terceros.
2. **Sin red tras la instalación.** La app no hace ninguna petición de red salvo la comprobación de actualización que el usuario lanza manualmente (y solo al propio origen).
3. **Datos cifrados en reposo** con una contraseña que solo conoce el usuario.
4. **Sin dependencias cargadas desde CDN.** Todas las librerías se empaquetan en el build.
5. **Sin analítica, telemetría, fuentes externas ni iconos externos.**
6. **Solo lectura respecto al banco.** La app nunca conoce claves bancarias ni inicia pagos.
7. **Actualizaciones solo bajo demanda** (ver §6).
8. **Nunca se suben datos reales a GitHub** (extractos, contactos, copias). Solo código y datos de prueba inventados.

## 3. Sobre el usuario (cómo trabajar con él)

- Estudiante de ingeniería; entiende conceptos técnicos pero **tiene poca experiencia con git/GitHub**.
- Explica cada comando de terminal y cada paso en GitHub antes de ejecutarlo, en español.
- Pregunta antes de tomar decisiones que cambien el comportamiento descrito aquí.
- Trabaja en **Windows + Chrome**; prueba también en **iPhone (Safari)**.
- Interfaz y textos de la app **en español**.

## 4. Stack técnico propuesto

| Pieza | Elección | Motivo |
|---|---|---|
| Build | Vite + TypeScript | Simple, rápido, buen soporte PWA |
| UI | Preact (o Svelte) | Ligero; evita un framework pesado |
| PWA | `vite-plugin-pwa` con `registerType: 'prompt'` | Control manual de actualizaciones |
| Almacenamiento | IndexedDB (vía `idb`) | Persistente en el navegador |
| Cifrado | WebCrypto: PBKDF2-SHA256 (≥600 000 iteraciones) + AES-GCM 256 | Nativo, sin dependencias |
| Lectura de PDF | `pdfjs-dist` (worker empaquetado localmente, `isEvalSupported: false`) | El banco exporta el extracto en PDF |
| Gráficas | Chart.js | Ligero, suficiente |
| Contactos | Parser propio de vCard (.vcf) | Formato simple; evita dependencias |
| Tests | Vitest | Para importador, cifrado y emparejado de deudas |
| Hosting | GitHub Pages + GitHub Actions | Gratis, solo sirve archivos estáticos |

Si Claude Code propone otra alternativa, debe justificarla y preguntar.

## 5. Seguridad

### 5.1 Content-Security-Policy
Incluir en `index.html` (y comprobar que el build no la rompe):

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

- `connect-src 'self'` impide que el código envíe datos a cualquier otro dominio.
- Si pdf.js necesitara WebAssembly, añadir **solo** `'wasm-unsafe-eval'` a `script-src`, explicándoselo al usuario. Nunca `'unsafe-eval'` ni `'unsafe-inline'` en scripts.

### 5.2 Cifrado de datos
- Primera apertura: el usuario crea una contraseña (mínimo 10 caracteres; mostrar aviso claro: **si se olvida, los datos no se pueden recuperar**).
- Clave derivada con PBKDF2 (sal aleatoria de 16 bytes guardada junto a los datos).
- Enfoque recomendado (los datos son pequeños: miles de filas): todo el estado de la app se guarda como **un único blob cifrado con AES-GCM** en IndexedDB. Al desbloquear se descifra en memoria; cada cambio vuelve a cifrar y guardar.
- Guardar también un "verificador" cifrado para detectar contraseña incorrecta.
- Cambio de contraseña: re-cifrar todo.
- La clave nunca se guarda en disco ni en `localStorage`.
- **El PDF importado no se guarda**: se lee en memoria, se extraen los movimientos y se descarta.

### 5.3 Bloqueo
- Pantalla de desbloqueo al abrir.
- Bloqueo automático tras **5 minutos** de inactividad o al pasar a segundo plano más de 5 minutos (configurable en Ajustes).
- Al bloquear: borrar de memoria la clave y los datos descifrados.

### 5.4 Persistencia
- Llamar a `navigator.storage.persist()` y mostrar en Ajustes si se ha concedido.
- Aviso visible si no hay copia de seguridad reciente (ver §11).

## 6. Política de actualizaciones (requisito del usuario)

- El service worker sirve la app **siempre desde caché** (cache-first para todo el código).
- **Nunca** se activa una versión nueva automáticamente. Con `registerType: 'prompt'`, el navegador puede descargar el service worker nuevo, pero este queda **en espera** hasta que el usuario lo acepte.
- En Ajustes:
  - Mostrar la **versión actual** (inyectada en el build desde `package.json`).
  - Botón **"Buscar actualización"**: comprueba si hay versión nueva; si la hay, muestra el número de versión y un botón **"Actualizar ahora"** que activa el service worker en espera y recarga.
- No mostrar banners automáticos de "nueva versión".

## 7. Modelo de datos

Importes siempre en **céntimos (enteros)** para evitar errores de redondeo.

```ts
type TipoMovimiento =
  | 'tarjeta'            // "COMPRA T.C. ..."
  | 'tarjeta_diferida'   // compras sin prefijo (online, extranjero, suscripciones)
  | 'devolucion'         // "DEVOLUCION T.P.V. ..."
  | 'bizum'              // "ENVIO BIZUM ..."
  | 'otro'               // cualquier prefijo aún no conocido (recibos, transferencias, nómina...)

Movimiento {
  id: string               // ver §8.5
  fecha: string            // fecha de operación (ISO aaaa-mm-dd); el extracto NO trae hora
  fechaValor: string
  importe: number          // céntimos; positivo = entra, negativo = sale
  concepto: string         // texto original completo
  tipo: TipoMovimiento
  comercio?: string        // para tarjeta / tarjeta_diferida / devolucion
  textoBizum?: string      // texto libre del Bizum (null si es un texto por defecto)
  nombreEnConcepto?: string // nombre detectado en el texto del Bizum ("Bizum de Jorge" → "JORGE")
  saldoDespues: number     // calculado a partir del SALDO ANTERIOR (§8.4)
  personaId?: string       // contraparte asignada (por emparejado o a mano)
  categoriaId: string
  categoriaManual: boolean
  nota?: string
  importacionId: string
}

Categoria { id, nombre, tipo: 'gasto' | 'ingreso' | 'ambos', color, orden }

ReglaCategoria {
  id
  campo: 'comercio' | 'concepto'
  contiene: string         // texto normalizado (§8.3)
  categoriaId
  creadaPorUsuario: boolean
}

Persona {
  id
  nombre                   // como lo ve el usuario ("Andres", "Lucia")
  telefonos: string[]
  aliasBizum: string[]     // textos/nombres que suelen aparecer en sus Bizum, normalizados
  origen: 'vcf' | 'manual'
}

Deuda {
  id
  personaId
  direccion: 'me_debe' | 'le_debo'
  importe: number          // céntimos, siempre positivo
  concepto: string
  fecha: string
  eliminada: boolean
}

Pago {
  id
  personaId
  movimientoId?: string    // si viene del banco
  importe: number          // céntimos; positivo = la persona me paga, negativo = yo le pago
  fecha: string
  manual: boolean
}

Importacion {
  id, fecha, nombreArchivo,
  periodoDesde, periodoHasta,
  saldoAnterior, saldoNuevo,
  filasLeidas, filasNuevas, filasDuplicadas
}
```

### Saldo con cada persona
Saldo con una persona = (deudas `me_debe`) − (deudas `le_debo`) − (pagos recibidos) + (pagos hechos).

- Saldo > 0 → "Te debe X €".
- Saldo < 0 → "Le debes X €".
- Saldo = 0 → al día.

Requisitos confirmados por el usuario:
- **Pago parcial:** se resta y queda pendiente el resto.
- **Pago de más:** el saldo cambia de signo y se mantiene. Ejemplo: Andres te debe 40 € y te paga 50 € → pasas a deberle 10 €.

## 8. Importador de extractos

### 8.1 Flujo
1. El usuario descarga el extracto de movimientos en **PDF** desde la web o la app de Kutxabank.
2. En la app: **Importar → Elegir archivo**.
3. La app lee el PDF en memoria, extrae los movimientos y muestra una **vista previa**: periodo, saldo anterior y nuevo, nº de movimientos, nuevos y duplicados, y la lista con su categoría propuesta.
4. Si la comprobación de saldo falla (§8.4), mostrar un error claro y **no importar**.
5. El usuario confirma → se guardan los movimientos nuevos.
6. Después se lanzan las **preguntas de emparejado de deudas** (§10.3).
7. Al terminar: recordatorio de exportar copia de seguridad.

### 8.2 Formato real del PDF de Kutxabank

Generado con JasperReports: texto seleccionable (no es una imagen), tamaño A4, una o varias páginas. Ver un ejemplo completo inventado en el **Apéndice A**.

Estructura:
- **Cabecera en cada página**: "KUTXABANK, S.A.", texto de cortesía, **nombre y dirección del titular** y el código de cuenta. **Ignorar todo esto y no guardarlo nunca.**
- **Tabla** con 4 columnas: `Fecha`, `Concepto`, `Valor`, `Importe`.
  - `Fecha`: fecha de operación, `dd/mm/aa` (**año con 2 dígitos** → 20aa).
  - `Concepto`: texto libre del banco.
  - `Valor`: fecha valor, `dd/mm/aa`. En compras sin prefijo puede ser **anterior** a la fecha de operación.
  - `Importe`: coma decimal, signo `-` solo en cargos, sin símbolo €. Contemplar también separador de miles con punto (`1.234,56`).
- Primera fila: `SALDO ANTERIOR` con solo importe.
- Última fila (en la última página): `SALDO NUEVO` con solo importe.
- **No hay columna de saldo por movimiento, ni hora, ni ordenante, ni beneficiario.**
- La tabla continúa en la página siguiente tras repetir la cabecera.

### 8.3 Tipos de movimiento (por prefijo del concepto)

| Prefijo del concepto | Tipo | Qué extraer | Ejemplo (inventado) |
|---|---|---|---|
| `COMPRA T.C. ` | `tarjeta` | `comercio` = resto del texto | `COMPRA T.C. PANADERIA EL TRIGO` |
| `DEVOLUCION T.P.V. ` | `devolucion` (importe positivo) | `comercio` = resto del texto | `DEVOLUCION T.P.V. TREN CERCANIAS TNA 05` |
| `ENVIO BIZUM ` | `bizum` (dirección por el **signo**) | `textoBizum` = resto del texto | `ENVIO BIZUM Lucia` |
| sin prefijo conocido (en el PDF aparece con 2 espacios más de sangría) | `tarjeta_diferida` si el importe es negativo; si no, `otro` | `comercio` = concepto completo | `APP TAXI   *TRIP`, `Streaming M1234ABCD` |

Reglas importantes:
- **Bizum**: el concepto empieza por `ENVIO BIZUM` **tanto en los enviados como en los recibidos**. La dirección se deduce **solo del signo del importe**.
- Textos por defecto de Bizum que significan "sin texto" (→ `textoBizum = null`): `Envio de dinero con Bizum`, `Sin concepto`. Mantener la lista en un único sitio para ampliarla.
- Patrón `Bizum de <Nombre>` → `nombreEnConcepto = <Nombre>` normalizado (aparece en mayúsculas o minúsculas indistintamente: `Bizum de Jorge`, `Bizum de JORGE`).
- En el resto de Bizum el texto libre puede ser un nombre (`Lucia`), una frase con nombre (`Andres clases martes`) o algo sin nombre (`Fin de año`, `cena viernes`).
- **En los Bizum enviados casi nunca hay información de a quién**: el texto suele ser el de por defecto. Eso condiciona el emparejado (§10.3).
- Las compras en el extranjero, online y suscripciones llegan **sin prefijo** y con fecha valor anterior. Para el `comercio`, quitar códigos finales numéricos o alfanuméricos al crear reglas (por ejemplo `SUPER EJEMPLO 5350` y `SUPER EJEMPLO 4665` → misma regla `SUPER EJEMPLO`; ofrecer al usuario editar el texto de la regla antes de guardarla).
- **Recibos domiciliados, transferencias y nómina aún no han aparecido en ningún extracto.** Cualquier prefijo desconocido → tipo `otro`, categoría "Otros", y en la vista previa marcarlo como "tipo no reconocido" para que el usuario avise y se añada a la tabla.

### 8.4 Comprobación de saldo (obligatoria)
- `saldoAnterior + Σ importes == saldoNuevo` (en céntimos). Si no cuadra, el PDF se ha leído mal: **no importar**.
- `saldoDespues` de cada movimiento = saldo acumulado en el orden del PDF.
- Al importar un extracto posterior a otro ya importado: si el periodo es contiguo, comprobar que su `SALDO ANTERIOR` coincide con el saldo calculado hasta esa fecha; si no coincide, avisar (puede faltar un periodo intermedio).

### 8.5 Duplicados (extractos que se solapan)
Sin hora ni saldo por fila, puede haber **movimientos idénticos legítimos** el mismo día (en el extracto real hay dos compras iguales de tren el mismo día). Por eso:
- Clave de un movimiento: `fecha + fechaValor + importe + concepto normalizado`.
- Al importar, para cada clave: si en la base hay *k* movimientos con esa clave y en el archivo hay *n*, añadir solo `max(0, n − k)`.
- `id` = `clave + "#" + número de aparición`.
- Recomendar al usuario descargar siempre periodos de días completos.

### 8.6 Lectura del PDF (implementación)
1. `pdfjs-dist` → para cada página, `getTextContent()` → elementos de texto con su posición (x, y).
2. Agrupar elementos en **líneas** por coordenada y (con tolerancia de unos pocos puntos) y ordenar por x.
3. Pasar las líneas a una **función pura** `parsearLineasKutxabank(lineas: string[]) → { saldoAnterior, saldoNuevo, movimientos }`, que es la que se testea. El paso 1–2 queda aislado en `src/importador/pdf.ts` y el 3 en `src/importador/kutxabank.ts`.
4. Una línea es movimiento si empieza por una fecha `dd/mm/aa`, termina en un importe y contiene una segunda fecha (la de valor). Las columnas se identifican por posición, no por contar espacios.
5. Si no se reconoce el formato (cero movimientos o saldo descuadrado): error claro con el número de líneas leídas, sin importar nada.

Tests:
- `tests/fixtures/extracto-ejemplo.txt`: el Apéndice A, como líneas de texto, para testear el parser de líneas sin PDF.
- Generar con un script un **PDF de prueba** a partir de ese texto (por ejemplo con `pdf-lib`, solo como dependencia de desarrollo) para testear también la extracción de líneas.
- El usuario probará en local con su PDF real guardado en `datos-reales/` (ignorado por git). **Nunca** commitear un extracto real.

### 8.7 Normalización de textos
Para comparar nombres, conceptos y reglas:
- Mayúsculas, sin tildes (`Á→A`, `Ñ→N`), espacios múltiples a uno, sin espacios al principio ni al final.
- El usuario escribe con faltas o abreviaturas en los Bizum (por ejemplo `entrda concierto`, `taxi ale`): la búsqueda de nombres debe ser por **palabra completa**, no por subcadena, para no confundir "ale" con "Alejandro" ni con "tale" (y aun así, no emparejar nunca sin confirmación).

## 9. Clasificación de gastos

### 9.1 Categorías por defecto
Gastos: Supermercado, Comida fuera, Ocio, Gasolina, Transporte, Suscripciones, Ropa, Salud, Hogar, Educación, Viajes, Bizum enviado, Otros gastos.
Ingresos: Nómina / trabajo, Bizum recibido, Devoluciones, Otros ingresos.

El usuario puede crear, renombrar, recolorear y borrar categorías (al borrar, pedir a cuál mover los movimientos).

### 9.2 Reglas
- Reglas iniciales por palabra clave sobre `comercio`, en un único archivo fácil de ampliar. Ejemplos:
  - Supermercado: `MERCADONA`, `EROSKI`, `CARREFOUR`, `LIDL`, `DIA`, `BM` (supermercados BM), `ALCAMPO`, `BIEDRONKA`, `ZABKA`.
  - Transporte: `RENFE`, `CERCANIAS`, `METRO`, `EMT`, `UBER`, `CABIFY`, `BOLT`, `MOVILIDAD`.
  - Gasolina: `REPSOL`, `CEPSA`, `BP`, `GALP`, `PLENOIL`, `BALLENOIL`.
  - Suscripciones: `SPOTIFY`, `NETFLIX`, `HBO`, `DISNEY`, `AMAZON PRIME`, `APPLE.COM/BILL`.
  - Comida fuera: `100 MONTADITOS`, `TELEPIZZA`, `BURGER KING`, `MCDONALDS`, `KEBAB`.
- `bizum` → "Bizum enviado" / "Bizum recibido" según el signo, salvo regla del usuario.
- `devolucion` → misma categoría que la compra del mismo comercio si existe; si no, "Devoluciones". (Así una compra devuelta no infla el gasto de su categoría.)
- Orden: reglas del usuario primero, luego las de defecto; si nada encaja → "Otros gastos" / "Otros ingresos".
- Al cambiar a mano la categoría de un movimiento: preguntar **"¿Aplicar a todos los de [comercio]?"**; si acepta, crear la regla (con el texto editable) y reclasificar los movimientos no editados a mano.
- Un movimiento con `categoriaManual: true` nunca se reclasifica automáticamente.

## 10. Personas, contactos y deudas

### 10.1 Contactos
Una PWA en iPhone **no puede leer la agenda**. Solución acordada:
- **Importar contactos desde un archivo .vcf.** Explicar al usuario cómo exportarlo:
  - iPhone: app Contactos → Listas → mantener pulsada la lista → Exportar.
  - O desde iCloud.com → Contactos → seleccionar → Exportar vCard.
- Leer `FN`, `N` y `TEL`. Guardar solo nombre y teléfonos (cifrados, como todo).
- Reimportar fusiona por teléfono o nombre sin duplicar.
- También se puede crear una persona a mano.
- Búsqueda rápida de contactos al crear una deuda.

### 10.2 Deudas
- Crear deuda: persona, dirección ("me debe" / "le debo"), importe, concepto, fecha.
- Ver por persona: saldo actual e historial (deudas y pagos).
- **Eliminar manualmente** una deuda o un pago (con confirmación).
- **Marcar como saldada** a mano (crea un pago manual por el importe pendiente).
- Lista principal: personas con saldo distinto de cero, ordenadas por importe.

### 10.3 Emparejado con Bizum (requisito clave)
El extracto **no trae el nombre de quien envía ni de quien recibe**: solo el texto libre del Bizum y el importe. El emparejado se basa en eso y **siempre pide confirmación**.

**Bizum recibidos** (importe > 0), entre las personas con saldo > 0 (te deben):
1. Si `nombreEnConcepto` o alguna palabra de `textoBizum` coincide con el nombre de la persona o con uno de sus `aliasBizum` → sugerencia fuerte.
2. Si no, y el importe coincide exactamente con el saldo pendiente de una sola persona → sugerencia débil ("¿Es de Lucia? Te debe exactamente 20,00 €").
3. Si no hay ninguna sugerencia: no preguntar; el usuario puede asignarlo a mano desde el movimiento.

**Bizum enviados** (importe < 0), entre las personas con saldo < 0 (les debes):
1. Si hay texto con nombre → igual que arriba.
2. Si el importe coincide exactamente con lo que debes a una sola persona → sugerencia débil.
3. Si no: no preguntar automáticamente, pero en Deudas mostrar "Bizum enviados sin asignar" para asignarlos con un toque.

Pregunta tipo:

> "Bizum recibido, +40,00 € — *Andres clases martes* (06/03/26)
> ¿Es un pago de **Andres** (te debe 60,00 €)?"
> [Sí] [No] [Es de otra persona…]

- **Sí** → crear `Pago` vinculado; saldo actualizado (parcial, exacto o de más, §7).
- **Es de otra persona…** → elegir persona; ofrecer **"Recordar que '[texto]' es de [persona]"** → se añade a `aliasBizum` (útil cuando paga otra persona por alguien, o con apodos).
- **No** → no volver a preguntar por ese movimiento.
- Si hay varias personas candidatas, mostrar las opciones ordenadas.
- Un movimiento solo puede estar vinculado a un pago.
- Desde la ficha de cualquier Bizum: "Asignar a persona" a mano.

## 11. Copias de seguridad y sincronización con el PC

- **Exportar copia**: un archivo `.finanzas` con el estado completo **cifrado** (misma contraseña), con fecha en el nombre.
- **Importar copia**: reemplazar todo (con confirmación clara).
- Recordatorio tras cada importación de extracto y si la última copia tiene más de 30 días.
- Sincronización iPhone ↔ PC: manual, exportando en uno e importando en el otro (por ejemplo vía iCloud Drive, OneDrive o cable). Explicarlo en una pantalla de ayuda.

## 12. Pantallas

1. **Desbloqueo / creación de contraseña.**
2. **Inicio** (mes actual, con selector de mes): ingresos, gastos, balance, saldo actual; las 5 categorías con más gasto; personas con saldo pendiente; preguntas de emparejado pendientes; aviso de copia.
3. **Movimientos**: lista por fecha, buscador, filtros (mes, categoría, ingreso/gasto, tipo); al tocar uno: detalle, cambiar categoría, nota, asignar a persona.
4. **Gráficas**:
   - Barras: ingresos vs gastos por mes (últimos 12 meses).
   - Donut: gasto por categoría (mes o año seleccionable).
   - Línea: evolución del saldo (con `saldoDespues`).
   - Resumen anual: totales por categoría y porcentaje.
5. **Deudas**: personas con saldo, detalle de persona, nueva deuda, Bizum sin asignar.
6. **Importar**: extracto PDF y contactos .vcf.
7. **Ajustes**: categorías y reglas, contraseña, tiempo de bloqueo, exportar/importar copia, versión y **Buscar actualización**, borrar todos los datos (doble confirmación).

Diseño: pensado primero para el móvil, modo claro/oscuro automático, navegación por pestañas inferior, área segura del iPhone respetada, `manifest` con iconos propios (sin recursos externos).

## 13. Repositorio y despliegue

- Repositorio en GitHub. **GitHub Pages en cuentas gratuitas requiere repositorio público**: el código será visible, pero no contiene datos. Por eso es crítico el `.gitignore`:
  ```
  *.pdf
  *.xlsx
  *.xls
  *.csv
  *.vcf
  *.finanzas
  datos-reales/
  !tests/fixtures/**
  ```
  (los fixtures de `tests/` son datos inventados; revisar antes de cada commit que no se cuela ningún archivo real).
- Despliegue con GitHub Actions al hacer push a `main`.
- Activar la **verificación en dos pasos** en la cuenta de GitHub (guiar al usuario).
- `base` de Vite configurada para la ruta de GitHub Pages (`/<nombre-repo>/`).
- Explicar al usuario, paso a paso: crear el repo, el primer push, activar Pages, instalar la app en iPhone y en Chrome.

## 14. Plan por fases

Cada fase termina con algo que el usuario pueda probar y con tests de la lógica crítica.

1. **Esqueleto**: Vite + TS + PWA instalable, CSP, navegación vacía, despliegue en GitHub Pages funcionando y app instalada en iPhone y PC.
2. **Seguridad**: creación de contraseña, cifrado/descifrado, desbloqueo, bloqueo automático. Tests de cifrado.
3. **Importador PDF**: extracción de líneas, parser, tipos, comprobación de saldo, duplicados, vista previa, lista de movimientos. Tests con el Apéndice A; prueba manual con el PDF real del usuario.
4. **Categorías y reglas**: clasificación automática, edición manual, "aplicar a todos".
5. **Gráficas e inicio**.
6. **Personas y deudas**: importación .vcf, deudas manuales, saldos, emparejado con confirmación, Bizum sin asignar. Tests de emparejado (parcial, exacto, de más, nombre en texto, alias, coincidencia por importe, varios candidatos).
7. **Copias de seguridad** y pantalla de ayuda.
8. **Actualizaciones manuales**: botón y versión; probar el ciclo completo publicando una v0.2.

## 15. Fuera de alcance (por ahora)

- Conexión automática con el banco (open banking / Enable Banking). Se valoró y se descartó en esta versión por depender de un tercero. Dejar el importador desacoplado (interfaz común de "fuente de movimientos") para poder añadir otra fuente en el futuro.
- Varias cuentas o varios bancos.
- Notificaciones push, sincronización automática, cuentas de usuario.

## 16. Pendiente del usuario

- [ ] Comprobar si la web de Kutxabank permite descargar los movimientos también en **Excel, CSV o "Norma 43"**. Si existe, enviar un ejemplo: podría traer más datos y sería más robusto que el PDF.
- [ ] Cuando aparezcan, enviar ejemplos (inventados o tachados) de **recibos domiciliados, transferencias y nómina** para completar la tabla de §8.3.
- [ ] Nombre definitivo de la app.

---

## Apéndice A — Extracto de ejemplo (INVENTADO)

Reproduce **exactamente el formato** del PDF real de Kutxabank (texto extraído con `pdftotext -layout`), con datos ficticios. Guardarlo como `tests/fixtures/extracto-ejemplo.txt`.

```
KUTXABANK, S.A.
                                                Estimado/a cliente:
                                                Nos complace remitirle el detalle de las
                                                operaciones efectuadas en su cuenta en
                                                las fechas que se indican.


                                                          Atentamente
     TITULAR DE PRUEBA


     CALLE INVENTADA, 1
                                                -------------------------------------------
     00000 CIUDAD                                        Código cuenta cliente(C.C.C.)
                                                Entidad        Oficina       d.c.    NºCuenta
                                                -------------------------------------------
                                                 0000            0000         00     0000000000
------------------------------------------------------------------------------------------
      Fecha                  Concepto                             Valor             Importe
------------------------------------------------------------------------------------------
                  SALDO ANTERIOR                                                    150,00
     02/03/26     COMPRA T.C. PANADERIA EL TRIGO              02/03/26                   -2,40
     02/03/26     COMPRA T.C. SUPERMERCADO EJEMPLO CENTRO     02/03/26                  -18,35
     03/03/26     ENVIO BIZUM Lucia                           03/03/26                   30,00
     03/03/26     ENVIO BIZUM Bizum de Jorge                  03/03/26                   12,50
     03/03/26     ENVIO BIZUM Bizum de JORGE                  03/03/26                    4,00
     04/03/26     ENVIO BIZUM Envio de dinero con Bizum       04/03/26                  -15,00
     04/03/26       MOVILIDAD EJEMPLO                         02/03/26                   -0,75
     05/03/26       APP TAXI   *TRIP                          03/03/26                   -8,20
     05/03/26     ENVIO BIZUM Sin concepto                    05/03/26                    7,00
     06/03/26     COMPRA T.C. GASOLINERA PRUEBA 12            06/03/26                  -40,00
     06/03/26     ENVIO BIZUM Andres clases martes            06/03/26                   45,00
     07/03/26     COMPRA T.C. TREN CERCANIAS TNA 05           07/03/26                   -3,10
     07/03/26     DEVOLUCION T.P.V. TREN CERCANIAS TNA 05     08/03/26                    3,10
     07/03/26     COMPRA T.C. TREN CERCANIAS TNA 05           07/03/26                   -3,10
     07/03/26     COMPRA T.C. TREN CERCANIAS TNA 05           07/03/26                   -3,10
     08/03/26       Streaming M1234ABCD                       06/03/26                   -9,99
     08/03/26       TIENDA EXTRANJERA 4021                    06/03/26                  -12,47
     09/03/26     ENVIO BIZUM cena viernes                    09/03/26                  -22,00
     09/03/26     ENVIO BIZUM entrada concierto               09/03/26                   25,00


                  SALDO NUEVO                                                       138,14
```

Resultados esperados del parser (para los tests):
- `saldoAnterior` = 15000, `saldoNuevo` = 13814, **19 movimientos**; la suma de importes es −1186 y cuadra.
- Tipos: 6 `tarjeta`, 1 `devolucion`, 8 `bizum`, 4 `tarjeta_diferida` (MOVILIDAD EJEMPLO, APP TAXI *TRIP, Streaming…, TIENDA EXTRANJERA…).
- Bizum: `Bizum de Jorge` y `Bizum de JORGE` → `nombreEnConcepto = "JORGE"`; `Envio de dinero con Bizum` y `Sin concepto` → `textoBizum = null`; `Lucia` → `textoBizum = "Lucia"`.
- `MOVILIDAD EJEMPLO`: fecha 2026-03-04, fechaValor 2026-03-02.
- Duplicados: las tres compras `TREN CERCANIAS TNA 05` de −3,10 del 07/03 son **tres movimientos distintos**. Importar el mismo archivo dos veces → 0 nuevos. Importar un archivo que solo contenga dos de ellas → 0 nuevos.
- `saldoDespues` del último movimiento = 13814.
- El parser **no debe devolver** el nombre del titular, la dirección ni el número de cuenta.
