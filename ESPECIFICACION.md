# Especificación — App de finanzas personales (PWA)

> Documento de partida para Claude Code. Léelo entero antes de escribir código.
> Nombre provisional de la app: **Finanzas** (el usuario puede cambiarlo).
> Versión del documento: **v3** — el importador usa el **Excel (.xls) real de Kutxabank**. Junto a este documento va `extracto-ejemplo.xls`, un extracto **inventado** con el mismo formato, para los tests (descrito en el Apéndice A).

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
| Lectura de Excel | SheetJS (`xlsx`), instalado desde el tarball oficial de `cdn.sheetjs.com` y empaquetado | El banco exporta en `.xls` antiguo (BIFF8); el paquete `xlsx` de npm está desactualizado |
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
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

- `connect-src 'self'` impide que el código envíe datos a cualquier otro dominio.
- Nunca `'unsafe-eval'` ni `'unsafe-inline'` en scripts. Si alguna librería lo exige, parar y consultarlo con el usuario.

### 5.2 Cifrado de datos
- Primera apertura: el usuario crea una contraseña (mínimo 10 caracteres; mostrar aviso claro: **si se olvida, los datos no se pueden recuperar**).
- Clave derivada con PBKDF2 (sal aleatoria de 16 bytes guardada junto a los datos).
- Enfoque recomendado (los datos son pequeños: miles de filas): todo el estado de la app se guarda como **un único blob cifrado con AES-GCM** en IndexedDB. Al desbloquear se descifra en memoria; cada cambio vuelve a cifrar y guardar.
- Guardar también un "verificador" cifrado para detectar contraseña incorrecta.
- Cambio de contraseña: re-cifrar todo.
- La clave nunca se guarda en disco ni en `localStorage`.
- **El archivo importado no se guarda**: se lee en memoria, se extraen los movimientos y se descarta.

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

Importes y saldos siempre en **céntimos (enteros)** para evitar errores de redondeo (`Math.round(valor * 100)` al leer el Excel).

```ts
type TipoMovimiento =
  | 'tarjeta'            // "COMPRA T.C. ..."
  | 'tarjeta_diferida'   // compras sin prefijo (online, extranjero, suscripciones, viajes)
  | 'devolucion'         // "DEVOLUCION T.P.V. ..."
  | 'bizum'              // "ENVIO BIZUM ..."
  | 'transferencia'      // "TRANSF. ..." (enviada) / "OP.NET ..." (recibida)
  | 'otro'               // prefijo desconocido con importe positivo (recibos, nómina... aún sin ejemplos)

Movimiento {
  id: string                // ver §8.5
  fecha: string             // fecha de operación (ISO aaaa-mm-dd); el extracto NO trae hora
  fechaValor: string
  importe: number           // céntimos; positivo = entra, negativo = sale
  saldo: number             // céntimos; saldo tras el movimiento (viene en el Excel)
  concepto: string          // texto original, sin espacios finales
  tipo: TipoMovimiento
  comercio?: string         // tarjeta / tarjeta_diferida / devolucion
  textoLibre?: string       // texto escrito por quien hizo el Bizum o la transferencia (null si es un texto por defecto)
  nombreEnConcepto?: string // nombre detectado ("Bizum de Jorge" → "JORGE")
  personaId?: string        // contraparte asignada (por emparejado o a mano)
  categoriaId: string
  categoriaManual: boolean
  nota?: string
  importacionId: string
}

Categoria { id, nombre, tipo: 'gasto' | 'ingreso' | 'ambos', color, orden }

ReglaCategoria {
  id
  campo: 'comercio' | 'concepto'
  contiene: string          // texto normalizado (§8.7)
  categoriaId
  creadaPorUsuario: boolean
}

Persona {
  id
  nombre                    // como lo ve el usuario ("Andres", "Lucia")
  telefonos: string[]
  aliasTexto: string[]      // nombres, apodos o textos que suelen aparecer en sus Bizum/transferencias, normalizados
  origen: 'vcf' | 'manual'
}

Deuda {
  id
  personaId
  direccion: 'me_debe' | 'le_debo'
  importe: number           // céntimos, siempre positivo
  concepto: string
  fecha: string
  eliminada: boolean
}

Pago {
  id
  personaId
  movimientoId?: string     // si viene del banco
  importe: number           // céntimos; positivo = la persona me paga, negativo = yo le pago
  fecha: string
  manual: boolean
}

Importacion {
  id, fecha, nombreArchivo,
  periodoDesde, periodoHasta,
  saldoInicial, saldoFinal,
  filasLeidas, filasNuevas, filasDuplicadas
}

Ajustes {
  miNombre: string[]        // cómo aparece el usuario en los textos de Bizum (p. ej. su nombre de pila);
                            // nunca se toma como contraparte. Se configura en Ajustes, NO va en el código.
  minutosBloqueo: number
  ...
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
1. El usuario descarga los movimientos en **Excel** desde la web de Kutxabank (archivo `movimientos_N.xls`).
2. En la app: **Importar → Elegir archivo**.
3. La app lee el archivo en memoria, extrae los movimientos y muestra una **vista previa**: periodo, saldo inicial y final, nº de movimientos, nuevos y duplicados, y la lista con su tipo y categoría propuesta. Los tipos no reconocidos se marcan.
4. Si la comprobación de saldo falla (§8.4), mostrar un error claro y **no importar**.
5. El usuario confirma → se guardan los movimientos nuevos.
6. Después se lanzan las **preguntas de emparejado de deudas** (§10.3).
7. Al terminar: recordatorio de exportar copia de seguridad.

### 8.2 Formato real del Excel de Kutxabank

- Formato **`.xls` antiguo (BIFF8, Excel 97-2003)**, no `.xlsx`. Una hoja llamada `Listado`.
- Celda `A5`: `Movimientos de cuenta` (título).
- **Fila 7: cabeceras** `fecha` | `concepto` | `fecha valor` | `importe` | `saldo` (columnas A–E, en minúsculas).
- Fila 8 vacía. **Datos desde la fila 9**, hasta la primera fila vacía. El rango declarado de la hoja llega mucho más abajo (filas vacías): no fiarse de él.
- Orden: **cronológico ascendente** (el más antiguo arriba).
- Tipos de celda:
  - `fecha` y `fecha valor`: **texto** `dd/mm/aaaa` (año de 4 dígitos), no fechas de Excel.
  - `concepto`: texto **con espacios de relleno al final** (recortar) y a veces **truncado** (~37 caracteres en compras: `COMPRA T.C. MERCADONA GRAL MARTINEZ C`).
  - `importe` y `saldo`: **números** (con formato `#,##0.00`). Negativo = cargo.
- **No hay hora, ni ordenante, ni beneficiario.**
- No hay fila de "saldo anterior": se deduce como `saldo[0] − importe[0]`.

Implementación:
- Localizar la fila de cabecera **buscando las cinco cabeceras** (sin distinguir mayúsculas ni tildes) en las primeras 30 filas, en lugar de asumir la fila 7.
- Leer las celdas como valor bruto (`raw`), no como texto formateado, para que los importes no dependan del idioma.
- Si no se encuentran las cabeceras: error claro "Este archivo no parece un extracto de Kutxabank".
- Aceptar también `.xlsx` y `.csv` con las mismas columnas (por si el usuario reguarda el archivo en Excel).
- Separar en `src/importador/leerHoja.ts` (archivo → filas) y `src/importador/kutxabank.ts` (filas → movimientos; función pura y testeada).

### 8.3 Tipos de movimiento (por prefijo del concepto)

| Prefijo | Tipo | Qué extraer | Ejemplos (inventados) |
|---|---|---|---|
| `COMPRA T.C. ` | `tarjeta` | `comercio` = resto | `COMPRA T.C. PANADERIA EL TRIGO` |
| `DEVOLUCION T.P.V. ` | `devolucion` (importe positivo) | `comercio` = resto | `DEVOLUCION T.P.V. TREN CERCANIAS TNA 05` |
| `ENVIO BIZUM ` | `bizum` (dirección por el **signo**) | `textoLibre` = resto | `ENVIO BIZUM Lucia` |
| `TRANSF. ` | `transferencia` (enviada) | resto = código del banco destino; sin texto útil | `TRANSF. 0000` |
| `OP.NET ` | `transferencia` (recibida) | `textoLibre` = resto | `OP.NET pepe` |
| sin prefijo conocido, importe negativo | `tarjeta_diferida` | `comercio` = concepto completo | `APP TAXI   *TRIP`, `Streaming M1234ABCD`, `AEROLINEA DEMO   ABC123XYZ` |
| sin prefijo conocido, importe positivo | `otro` | — | (aún sin ejemplos) |

Reglas importantes:
- **Bizum**: el concepto empieza por `ENVIO BIZUM` **tanto en los enviados como en los recibidos**. La dirección se deduce **solo del signo del importe**.
- Textos por defecto que significan "sin texto" (→ `textoLibre = null`): `Envio de dinero con Bizum`, `Sin concepto`. Mantener la lista en un único sitio para ampliarla.
- Patrón `Bizum de <Nombre>` → `nombreEnConcepto = <Nombre>` normalizado (aparece en mayúsculas o minúsculas: `Bizum de Jorge`, `Bizum de JORGE`).
- En el resto, el texto libre puede ser un nombre (`Lucia`), un apodo (`Tiburon`), una frase con nombre (`Andres clases martes`), algo sin nombre (`cena viernes`) o **el nombre del propio usuario** (`ENVIO BIZUM Titular`, Bizum enviado): los nombres de `Ajustes.miNombre` se ignoran al emparejar.
- **En los Bizum enviados casi nunca hay información de a quién**: suele aparecer el texto por defecto. Eso condiciona el emparejado (§10.3).
- Compras en el extranjero, online, viajes y suscripciones llegan **sin prefijo** y con fecha valor anterior a la de operación. Para crear reglas a partir de su `comercio`, proponer el texto sin códigos finales (`SUPER EJEMPLO 5350` y `SUPER EJEMPLO 4665` → regla `SUPER EJEMPLO`) y dejar que el usuario lo edite antes de guardar.
- **Recibos domiciliados y nómina aún no han aparecido.** Cualquier caso no reconocido se marca en la vista previa como "tipo no reconocido" para que el usuario avise y se añada a la tabla.

### 8.4 Comprobación de saldo (obligatoria)
- Para cada fila *i* > 0: `saldo[i] == saldo[i−1] + importe[i]` (en céntimos). Si alguna falla, el archivo se ha leído mal: **no importar** y decir en qué fila.
- `saldoInicial = saldo[0] − importe[0]`; `saldoFinal = saldo[último]`.
- Al importar un extracto que continúa a otro ya importado: comprobar que su `saldoInicial` coincide con el saldo del último movimiento anterior a esa fecha; si no coincide, avisar (puede faltar un periodo intermedio).

### 8.5 Duplicados (extractos que se solapan)
Sin hora puede haber **movimientos idénticos legítimos**, incluso con el mismo saldo (caso real: compra de tren −10, devolución +10 y otra compra −10 el mismo día; las dos compras tienen idéntico concepto, importe y saldo). Por eso:
- Clave: `fecha + fechaValor + importe + saldo + concepto normalizado`.
- Al importar, para cada clave: si en la base hay *k* movimientos con esa clave y en el archivo hay *n*, añadir solo `max(0, n − k)`.
- `id` = `clave + "#" + número de aparición`.
- Recomendar al usuario descargar siempre periodos de días completos.

### 8.6 Tests del importador
- Fixture: `tests/fixtures/extracto-ejemplo.xls` (se entrega junto a este documento; datos inventados, formato idéntico al real). Ver los resultados esperados en el Apéndice A.
- Tests de la función pura con filas construidas a mano para casos límite: cabecera en otra fila, filas vacías al final, concepto truncado, saldo descuadrado, archivo sin cabeceras.
- El usuario probará en local con su archivo real guardado en `datos-reales/` (ignorado por git). **Nunca** commitear un extracto real.

### 8.7 Normalización de textos
Para comparar nombres, conceptos y reglas:
- Recortar espacios, mayúsculas, sin tildes (`Á→A`, `Ñ→N`), espacios múltiples a uno.
- La búsqueda de nombres en el texto libre es por **palabra completa**, no por subcadena (que "ale" no case con "Alejandro"), y aun así nunca se empareja sin confirmación.

## 9. Clasificación de gastos

### 9.1 Categorías por defecto
Gastos: Supermercado, Comida fuera, Ocio, Transporte, Viajes, Gasolina, Suscripciones, Ropa, Salud, Hogar, Educación, Bizum enviado, Transferencias enviadas, Otros gastos.
Ingresos: Nómina / trabajo, Bizum recibido, Transferencias recibidas, Devoluciones, Otros ingresos.

El usuario puede crear, renombrar, recolorear y borrar categorías (al borrar, pedir a cuál mover los movimientos).

### 9.2 Reglas
- Reglas iniciales por palabra clave sobre `comercio`, en un único archivo fácil de ampliar. Ejemplos:
  - Supermercado: `MERCADONA`, `EROSKI`, `CARREFOUR`, `LIDL`, `DIA`, `BM` (supermercados BM), `ALCAMPO`, `AHORRAMAS`.
  - Comida fuera: `100 MONTADITOS`, `TELEPIZZA`, `BURGER KING`, `MCDONALDS`, `KEBAB`, `RESTAURANTE`, `CERVECERIA`, `BAR `.
  - Transporte: `RENFE`, `CERCANIAS`, `METRO`, `EMT`, `INTERBUS`, `FGV`, `UBER`, `CABIFY`, `BOLT`, `MOVILIDAD`.
  - Viajes: `RYANAIR`, `VUELING`, `IBERIA`, `OUIGO`, `IRYO`, `BOOKING`, `AIRBNB`.
  - Gasolina: `REPSOL`, `CEPSA`, `BP`, `GALP`, `PLENOIL`, `BALLENOIL`.
  - Suscripciones: `SPOTIFY`, `NETFLIX`, `HBO`, `DISNEY`, `AMAZON PRIME`, `APPLE.COM/BILL`, `ANTHROPIC`.
- `bizum` → "Bizum enviado" / "Bizum recibido" según el signo; `transferencia` → "Transferencias enviadas" / "recibidas"; salvo regla del usuario.
- `devolucion` → misma categoría que la última compra del mismo comercio si existe; si no, "Devoluciones". (Así una compra devuelta no infla el gasto de su categoría.)
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

### 10.3 Emparejado con Bizum y transferencias (requisito clave)
El extracto **no trae el nombre de quien envía ni de quien recibe**: solo el texto libre y el importe. El emparejado se basa en eso y **siempre pide confirmación**. Aplica a movimientos de tipo `bizum` y `transferencia`.

**Recibidos** (importe > 0), entre las personas con saldo > 0 (te deben):
1. Si `nombreEnConcepto` o alguna palabra de `textoLibre` coincide con el nombre de la persona o con uno de sus `aliasTexto` (ignorando `Ajustes.miNombre`) → sugerencia fuerte.
2. Si no, y el importe coincide exactamente con el saldo pendiente de una sola persona → sugerencia débil ("¿Es de Lucia? Te debe exactamente 20,00 €").
3. Si no hay ninguna sugerencia: no preguntar; el usuario puede asignarlo a mano desde el movimiento.

**Enviados** (importe < 0), entre las personas con saldo < 0 (les debes):
1. Si hay texto con nombre → igual que arriba.
2. Si el importe coincide exactamente con lo que debes a una sola persona → sugerencia débil.
3. Si no: no preguntar automáticamente, pero en Deudas mostrar "Bizum enviados sin asignar" (últimos 60 días) para asignarlos con un toque o descartarlos.

Pregunta tipo:

> "Bizum recibido, +45,00 € — *Andres clases martes* (02/03/2026)
> ¿Es un pago de **Andres** (te debe 60,00 €)?"
> [Sí] [No] [Es de otra persona…]

- **Sí** → crear `Pago` vinculado; saldo actualizado (parcial, exacto o de más, §7).
- **Es de otra persona…** → elegir persona; ofrecer **"Recordar que '[texto]' es de [persona]"** → se añade a `aliasTexto` (útil con apodos como "Tiburon", o cuando paga otra persona por alguien).
- **No** → no volver a preguntar por ese movimiento.
- Si hay varias personas candidatas, mostrar las opciones ordenadas.
- Un movimiento solo puede estar vinculado a un pago.
- Desde la ficha de cualquier Bizum o transferencia: "Asignar a persona" a mano.

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
   - Línea: evolución del saldo (columna `saldo`).
   - Resumen anual: totales por categoría y porcentaje.
5. **Deudas**: personas con saldo, detalle de persona, nueva deuda, Bizum sin asignar.
6. **Importar**: extracto Excel y contactos .vcf.
7. **Ajustes**: mi nombre (para ignorarlo en los Bizum), categorías y reglas, contraseña, tiempo de bloqueo, exportar/importar copia, versión y **Buscar actualización**, borrar todos los datos (doble confirmación).

Diseño: pensado primero para el móvil, modo claro/oscuro automático, navegación por pestañas inferior, área segura del iPhone respetada, `manifest` con iconos propios (sin recursos externos).

## 13. Repositorio y despliegue

- Repositorio en GitHub. **GitHub Pages en cuentas gratuitas requiere repositorio público**: el código será visible, pero no contiene datos. Por eso es crítico el `.gitignore`:
  ```
  *.xls
  *.xlsx
  *.csv
  *.pdf
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
3. **Importador Excel**: lectura del `.xls`, tipos, comprobación de saldo, duplicados, vista previa, lista de movimientos. Tests con el fixture; prueba manual con el archivo real del usuario.
4. **Categorías y reglas**: clasificación automática, edición manual, "aplicar a todos".
5. **Gráficas e inicio**.
6. **Personas y deudas**: importación .vcf, deudas manuales, saldos, emparejado con confirmación, Bizum sin asignar. Tests de emparejado (parcial, exacto, de más, nombre en texto, alias/apodo, mi nombre ignorado, coincidencia por importe, varios candidatos).
7. **Copias de seguridad** y pantalla de ayuda.
8. **Actualizaciones manuales**: botón y versión; probar el ciclo completo publicando una v0.2.

## 15. Fuera de alcance (por ahora)

- Conexión automática con el banco (open banking / Enable Banking). Se valoró y se descartó por depender de un tercero. Dejar el importador desacoplado (interfaz común de "fuente de movimientos") para poder añadir otra fuente en el futuro.
- Importar el extracto en **PDF** (Kutxabank también lo ofrece, pero el Excel trae el saldo por fila y es más fiable).
- Varias cuentas o varios bancos.
- Notificaciones push, sincronización automática, cuentas de usuario.

## 16. Pendiente del usuario

- [ ] Cuando aparezcan, enviar ejemplos (inventados o tachados) de **recibos domiciliados y nómina** para completar la tabla de §8.3.
- [ ] Confirmar qué es exactamente `OP.NET` (se ha asumido que es una transferencia recibida por banca online).
- [ ] Nombre definitivo de la app.

---

## Apéndice A — `extracto-ejemplo.xls` (INVENTADO)

Archivo entregado junto a este documento. Mismo formato que el real (BIFF8, hoja `Listado`, título en `A5`, cabeceras en la fila 7, datos desde la fila 9, fechas como texto, conceptos con espacios de relleno, importe y saldo numéricos). Copiarlo a `tests/fixtures/extracto-ejemplo.xls`.

Contenido (sin los espacios de relleno):

| fecha | concepto | fecha valor | importe | saldo |
|---|---|---|---|---|
| 02/03/2026 | ENVIO BIZUM Andres clases martes | 02/03/2026 | 45,00 | 195,00 |
| 02/03/2026 | MOVILIDAD EJEMPLO | 28/02/2026 | -0,75 | 194,25 |
| 02/03/2026 | COMPRA T.C. PANADERIA EL TRIGO | 02/03/2026 | -2,40 | 191,85 |
| 03/03/2026 | AEROLINEA DEMO   ABC123XYZ | 01/03/2026 | -30,81 | 161,04 |
| 03/03/2026 | COMPRA T.C. SUPERMERCADO EJEMPLO CENTR | 03/03/2026 | -18,35 | 142,69 |
| 03/03/2026 | ENVIO BIZUM Lucia | 03/03/2026 | 30,00 | 172,69 |
| 03/03/2026 | ENVIO BIZUM Bizum de Jorge | 03/03/2026 | 12,50 | 185,19 |
| 03/03/2026 | ENVIO BIZUM Bizum de JORGE | 03/03/2026 | 4,00 | 189,19 |
| 04/03/2026 | ENVIO BIZUM Envio de dinero con Bizum | 04/03/2026 | -15,00 | 174,19 |
| 04/03/2026 | ENVIO BIZUM Titular | 04/03/2026 | -4,00 | 170,19 |
| 05/03/2026 | APP TAXI   *TRIP | 03/03/2026 | -8,20 | 161,99 |
| 05/03/2026 | ENVIO BIZUM Sin concepto | 05/03/2026 | 7,00 | 168,99 |
| 05/03/2026 | ENVIO BIZUM Tiburon | 05/03/2026 | 10,90 | 179,89 |
| 06/03/2026 | OP.NET pepe | 06/03/2026 | 300,00 | 479,89 |
| 06/03/2026 | TRANSF. 0000 | 06/03/2026 | -5,00 | 474,89 |
| 06/03/2026 | COMPRA T.C. GASOLINERA PRUEBA 12 | 06/03/2026 | -40,00 | 434,89 |
| 07/03/2026 | COMPRA T.C. TREN CERCANIAS TNA 05 | 07/03/2026 | -3,10 | 431,79 |
| 07/03/2026 | DEVOLUCION T.P.V. TREN CERCANIAS TNA 05 | 08/03/2026 | 3,10 | 434,89 |
| 07/03/2026 | COMPRA T.C. TREN CERCANIAS TNA 05 | 07/03/2026 | -3,10 | 431,79 |
| 07/03/2026 | COMPRA T.C. TREN CERCANIAS TNA 05 | 07/03/2026 | -3,10 | 428,69 |
| 08/03/2026 | Streaming M1234ABCD | 06/03/2026 | -9,99 | 418,70 |
| 08/03/2026 | TIENDA EXTRANJERA 4021 | 06/03/2026 | -12,47 | 406,23 |
| 09/03/2026 | ENVIO BIZUM cena viernes | 09/03/2026 | -22,00 | 384,23 |
| 09/03/2026 | ENVIO BIZUM entrada concierto | 09/03/2026 | 25,00 | 409,23 |

Resultados esperados (tests):
- **24 movimientos**; `saldoInicial` = 15000 céntimos, `saldoFinal` = 40923; todas las filas cuadran con §8.4.
- Tipos: 6 `tarjeta`, 1 `devolucion`, 10 `bizum`, 2 `transferencia`, 5 `tarjeta_diferida` (MOVILIDAD EJEMPLO, AEROLINEA DEMO…, APP TAXI *TRIP, Streaming…, TIENDA EXTRANJERA…).
- `Bizum de Jorge` y `Bizum de JORGE` → `nombreEnConcepto = "JORGE"`; `Envio de dinero con Bizum` y `Sin concepto` → `textoLibre = null`; `Lucia` → `textoLibre = "Lucia"`; `OP.NET pepe` → `textoLibre = "pepe"`.
- Con `Ajustes.miNombre = ["Titular"]`, el Bizum `ENVIO BIZUM Titular` no genera ninguna sugerencia de persona.
- `MOVILIDAD EJEMPLO`: fecha 2026-03-02, fechaValor 2026-02-28.
- Duplicados: las dos compras `TREN CERCANIAS TNA 05` de −3,10 con saldo 431,79 y la de saldo 428,69 son **tres movimientos distintos**. Importar el mismo archivo dos veces → 0 nuevos.
- Los conceptos se devuelven sin los espacios finales.
