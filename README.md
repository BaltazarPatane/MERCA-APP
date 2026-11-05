<div align="center">

<img src="public/apple-touch-icon.png" alt="Logo de MERCA" width="112">

# MERCA

### Finanzas personales, registro automático de gastos y seguimiento de inversiones

**Ingeniería de software · Desarrollo web · Automatización iOS · OCR · PostgreSQL**

![React](https://img.shields.io/badge/React-18-149ECA?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-Atajos%20%2B%20OCR-555555?style=flat-square&logo=apple&logoColor=white)

**[Funcionamiento](#funcionamiento) · [Interfaz](#interfaz-y-funcionalidades) · [Arquitectura](#arquitectura-del-sistema) · [Configuración](#puesta-en-marcha) · [Seguridad](#seguridad-y-privacidad)**

</div>

![Portada de MERCA](docs/img/portada.svg)

> **Las imágenes de este README son representaciones de la interfaz con datos ficticios.** Los importes, destinatarios y cuentas fueron creados para documentar el proyecto. No corresponden a finanzas reales ni representan funciones adicionales a las implementadas.

## Descripción general

**MERCA** es una aplicación web para registrar, consultar y analizar **ingresos, gastos e inversiones** desde una computadora o un iPhone. Combina carga manual de movimientos con el registro automático de comprobantes mediante **Atajos de iOS** y una plataforma de análisis financiero desarrollada sobre Supabase.

El proyecto surge de una necesidad cotidiana: evitar cargar cada gasto a mano, conservar un historial trazable y distinguir **lo que se consume, lo que se ingresa y lo que se destina a inversiones**. La interfaz incorpora estadísticas y filtros por período sin mezclar esos tres flujos.

Su característica principal es la integración con **Atajos de iOS**. Desde el menú *Compartir* de un comprobante en PDF o imagen, un atajo extrae el texto mediante OCR o lectura del documento, solicita una categoría y envía los datos a una función de Supabase. El servidor interpreta la información, evita registros duplicados y guarda el gasto. La aplicación web permite luego consultar, corregir y analizar los movimientos.

La solución aprovecha servicios con opciones gratuitas, evita depender de WhatsApp o de una aplicación iOS nativa y no necesita almacenar las imágenes originales de los comprobantes. Las inversiones se registran como **aportes de dinero**, no como una cartera valuada a precios de mercado.

## Funcionalidades principales

| Módulo | Implementación |
| --- | --- |
| **Registro desde iPhone** | Compartir comprobantes PDF o imágenes mediante Atajos de iOS. |
| **Reconocimiento de comprobantes** | Extracción y normalización de importes, fechas, horas, referencias de operación y destinatarios cuando están presentes. |
| **Gastos automáticos** | Los comprobantes compartidos se clasifican como **gastos**, independientemente del titular de origen o destino. |
| **Ingresos manuales** | Se registran exclusivamente desde la aplicación web. |
| **Inversiones manuales** | Aportes con categorías independientes, activo/plataforma, cuenta de origen opcional e historial exclusivo. |
| **Validación y duplicados** | Comprobación de datos, referencias de operación y huellas de texto para evitar altas repetidas. |
| **Revisión excepcional** | Operaciones con datos insuficientes o formatos no confiables requieren intervención desde la web. |
| **Inicio** | Dinero total disponible y desglose por billetera, además de gastos, ingresos, inversiones y balance del período; gráficos y últimos movimientos. |
| **Movimientos** | Historial de gastos, ingresos y transferencias internas, con filtro por billetera, destinatario, estado y período, más edición y revisión. |
| **Inversiones** | Pantalla propia con filtros por período, categoría, billetera y estado, búsqueda de instrumentos y capital aportado. |
| **Nuevo movimiento** | Carga manual de **ingresos, gastos, inversiones y transferencias**; billetera de origen/destino y categoría según corresponda. |
| **Ajustes** | Administración de categorías y billeteras, saldos de apertura, activación/desactivación y exportación CSV con cuentas. |
| **Acceso** | Inicio de sesión mediante Supabase Authentication y separación de información por usuario. |
| **Interfaz** | Diseño responsive en modo oscuro, favicon y acceso directo desde la pantalla de inicio del iPhone. |

## Funcionamiento

El recorrido de un comprobante es el siguiente:

1. Se obtiene un comprobante de pago o transferencia en el iPhone.
2. Desde **Compartir**, se ejecuta el atajo de MERCA.
3. El atajo obtiene el texto del **PDF** o extrae texto de una **imagen** y permite elegir la categoría.
4. Se envía una solicitud HTTPS a la **Supabase Edge Function** `smooth-handler`.
5. El servidor interpreta y valida la información, busca duplicados y, cuando corresponde, registra el movimiento en PostgreSQL.
6. La aplicación web consulta los movimientos mediante Supabase y los incorpora al historial, los filtros y las estadísticas.

```mermaid
flowchart LR
    A["Comprobante PDF o imagen"] --> B["Atajos iOS"]
    B --> C["Extracción de texto / OCR"]
    C --> D["Solicitud HTTPS autenticada"]
    D --> E["Supabase Edge Function"]
    E --> F{"Validación y duplicados"}
    F -->|Confiable| G["Gasto confirmado"]
    F -->|Requiere revisión| H["Movimiento pendiente"]
    F -->|Inválido| I["Error informado"]
    G --> J["PostgreSQL"]
    H --> J
    J --> K["Web MERCA"]
    M["Carga manual · Ingreso / Gasto / Inversión"] --> K
    K -->|"Operaciones bajo RLS"| J
    K --> L["Historiales · Filtros · Balance · Gráficos"]
```

### Procesamiento y criterio de confiabilidad

El receptor reconoce estructuras conocidas de comprobantes, incluyendo formatos de **Mercado Pago**, y contempla particularidades del texto extraído de algunos PDF: por ejemplo, centavos en superíndice que pueden quedar unidos al importe al convertirse a texto.

La detección de un número no es suficiente para confirmarlo. MERCA procura comprobar que la **fecha y el importe sean consistentes**, y evita inferir valores cuando existen varias interpretaciones posibles. La referencia de operación se utiliza para prevenir duplicados; cuando no está disponible, puede emplearse una huella del texto normalizado.

Para el **destinatario**, se prioriza el nombre de la persona o comercio. Si no aparece, el procesamiento puede utilizar un alias o un identificador como CBU/CVU de destino, siempre que pueda distinguirlo del origen. El campo puede corregirse manualmente desde la web.

El sistema distingue tres resultados visibles desde Atajos:

| Mensaje | Significado |
| --- | --- |
| **Movimiento cargado exitosamente** | Se registró un gasto confirmado o ya existía un registro confirmado equivalente. |
| **Transacción a confirmar** | La operación quedó registrada, pero requiere revisión. |
| **Error al cargar el movimiento** | No se pudo registrar de forma válida. |

**Regla de clasificación:** cualquier comprobante compartido mediante Atajos se trata como **gasto**. Tanto los **ingresos como las inversiones se cargan manualmente desde la web**. El reconocimiento de comprobantes no registra automáticamente compras de activos financieros ni rentabilidades.

## Interfaz y funcionalidades

La aplicación dispone de **cinco pestañas**. El estilo visual se construyó con una paleta oscura azulada, acentos turquesa, componentes responsive e íconos de **Lucide**.

### Inicio — Resumen financiero

![Inicio de MERCA con cuatro indicadores — representación con datos ficticios](docs/img/ejemplo-inicio.svg)

La pantalla principal concentra cuatro indicadores para el período seleccionado: **gastos de consumo, ingresos, inversiones realizadas y balance del período**. Por separado, se muestra el **dinero total disponible** sin filtros temporales, distribuido por billeteras y por operaciones sin asignar. También ofrece gráficos y últimos movimientos.

Los importes del sistema se calculan con los registros consultados desde Supabase; **los movimientos pendientes y descartados no modifican el balance**. Las inversiones se contabilizan por separado y **no aparecen en el gráfico de gastos de consumo**.

Los filtros permiten consultar un **mes, día, rango de fechas o todo el historial**. También es posible acceder desde Inicio a los movimientos pendientes.

### Balance del período y dinero disponible

El **balance del período** representa el flujo neto para las fechas seleccionadas (no el patrimonio):

**Balance del período = ingresos confirmados − gastos confirmados − inversiones confirmadas**

El **dinero total disponible** se calcula sobre **todo el historial**, sin filtros, y además contempla los **saldos de apertura** que el usuario configure en sus billeteras. Las transferencias entre billeteras propias modifican la distribución pero no el total. Los registros históricos que todavía no tienen cuenta se muestran en **Sin asignar**.

| Ejemplo ilustrativo (octubre de 2026) | Importe |
| --- | ---: |
| Ingresos | $450.000 |
| Gastos de consumo | −$110.500 |
| Aportes a inversiones | −$95.000 |
| **Balance del período** | **$244.500** |

Las transferencias entre cuentas propias no se cuentan como ingresos o gastos del conjunto. Una inversión se resta cuando queda **Confirmada**; si está pendiente o descartada, no afecta el cálculo.

### Movimientos — Gastos e ingresos

![Historial de MERCA con navegación de cinco pestañas y datos ficticios](docs/img/ejemplo-movimientos.svg)

El historial de **gastos e ingresos** presenta cada operación con **categoría, destinatario, fecha, origen, cuenta asociada cuando existe, estado e importe**. Las inversiones tienen una pestaña e historial independientes. Incluye:

- Filtros combinables por período y estado.
- Búsqueda por nombre, alias, CBU o CVU del destinatario.
- Edición de monto, fecha, hora, tipo, categoría, descripción, destinatario y estado.
- Confirmación o descarte de movimientos pendientes.
- Identificación visual de categorías y estados.

La columna **Cuenta** muestra la cuenta registrada cuando está vinculada al movimiento. En caso contrario, se indica **«No asignada»**; el sistema no presupone qué cuenta se utilizó.

### Inversiones — Capital aportado e historial propio

![Nueva pestaña Inversiones de MERCA — ejemplo con valores y titulares ficticios](docs/img/ejemplo-inversiones.svg)

La sección de **Inversiones** incorpora una experiencia propia de seguimiento de aportes. Está organizada en tres indicadores: **invertido en el período**, **capital aportado histórico** y **cantidad de operaciones**. Debajo se encuentran los filtros y el historial, con la distribución del importe invertido por categoría.

- **Registro:** desde *Nueva inversión* se abre el formulario con el tercer tipo seleccionado. Se especifican importe, fecha, una categoría de inversión y, opcionalmente, activo/instrumento/plataforma, descripción y cuenta de origen.
- **Categorías independientes:** por ejemplo *Fondos comunes*, *Acciones*, *Plazo fijo* o *Criptomonedas*. Se crean y administran desde Ajustes.
- **Consulta y revisión:** filtros por mes, rango o todo el historial, además de categoría y estado. Búsqueda por activo/plataforma o descripción, edición de operaciones y acciones sobre pendientes.
- **Análisis:** total de aportes confirmados del período, histórico acumulado de aportes y desglose por categoría.
- **Balance:** los aportes confirmados reducen el dinero disponible, pero no se suman a los gastos de consumo.

<p align="center">
  <img src="docs/img/ejemplo-iphone-inversiones.svg" width="290" alt="Vista móvil ilustrativa de Inversiones en MERCA">
</p>

<p align="center"><em>Vista de ejemplo en iPhone, con navegación inferior y datos ficticios.</em></p>

> **Alcance contable:** MERCA registra capital aportado en pesos. El indicador de capital histórico **no representa el valor actual de las inversiones**. No existe cotización automática, cálculo de rentabilidad, intereses, rescates, ventas ni valorización de carteras.

Para el esquema de datos y el procedimiento de activación consultá la [documentación técnica de Inversiones](docs/inversiones.md).

### Nuevo movimiento — Carga manual

![Formulario de MERCA con tipo Inversión seleccionado y datos ficticios](docs/img/ejemplo-nuevo-movimiento.svg)

El formulario permite registrar **gastos, ingresos, inversiones y transferencias entre billeteras propias**. Gastos, ingresos e inversiones conservan sus categorías independientes; las transferencias no usan categoría y requieren origen y destino diferentes. En los demás movimientos se puede elegir billetera manualmente o dejarlos sin asignar. Gastos e inversiones conservan sus respectivos campos de destinatario/activo.

Se incluyen validación de importes, categorías activas según el tipo de movimiento y un botón para limpiar el formulario. Las operaciones manuales se crean **confirmadas**.

### Ajustes — Categorías, billeteras y respaldo

![Ajustes con categorías de inversión y cuentas ficticias](docs/img/ejemplo-ajustes.svg)

Las categorías de **gastos, ingresos e inversiones** se pueden **crear, renombrar, activar y desactivar** sin perder movimientos históricos. Las billeteras y cuentas se pueden crear, renombrar, tipificar, desactivar y ajustar por saldo de apertura. El historial se conserva al desactivar una billetera. Se mantiene la exportación CSV, que ahora incluye las cuentas de origen y destino.

**Atajos no cambia:** la nueva función smooth-handler v10, una vez desplegada en Supabase, puede detectar Mercado Pago como origen si el CUIL emisor corresponde al usuario autorizado. Los demás movimientos siguen en Sin asignar.

## Arquitectura del sistema

MERCA separa la interfaz, la autenticación, la recepción de comprobantes y el almacenamiento:

```mermaid
flowchart TB
    subgraph CLIENTES["Clientes"]
      A["iPhone · Atajos"] 
      W["Web responsive · PC / iPhone"]
    end
    A -->|"POST + x-merca-token"| E["Edge Function smooth-handler"]
    E -->|"Inserción y control de duplicados"| DB[("Supabase PostgreSQL")]
    W -->|"Login"| AUTH["Supabase Authentication"]
    W -->|"Consultas bajo RLS"| DB
    GH["GitHub · main"] -->|"Publicación"| C["Cloudflare Pages"]
    C -->|"Entrega la web"| W
```

### Tecnologías empleadas

| Tecnología | Uso en MERCA |
| --- | --- |
| **React 18** | Componentes e interacción de la interfaz web. |
| **TypeScript 5** | Tipado de movimientos, categorías, formularios y componentes. |
| **Vite 6** | Desarrollo, compilación y generación de archivos estáticos. |
| **CSS** | Diseño responsive, tarjetas, controles, gráficos y estilos visuales. |
| **Lucide React** | Iconografía de navegación, categorías, estados y acciones. |
| **Supabase JavaScript SDK** | Acceso autenticado a datos desde la web. |
| **Supabase Auth** | Gestión de usuarios y sesiones. |
| **Supabase PostgreSQL** | Persistencia de cuentas, categorías y movimientos. |
| **Row Level Security (RLS)** | Aislamiento de registros mediante `user_id`. |
| **Supabase Edge Functions** | Recepción HTTPS y procesamiento de comprobantes. |
| **Atajos de iOS / OCR** | Captura y extracción de texto al compartir archivos. |
| **Cloudflare Pages** | Alojamiento y publicación del frontend conectado a GitHub. |
| **GitHub Actions** | Pruebas del cálculo financiero (`npm test`), verificación de TypeScript y compilación (`npm run build`). |

### Modelo de datos

La información principal se distribuye en tres tablas:

| Tabla | Datos relevantes |
| --- | --- |
| `categorias` | Usuario, nombre, tipo (`gasto`, `ingreso`, `inversion`), color y estado activo. |
| `cuentas` | Usuario, nombre, tipo de billetera, moneda, estado y `saldo_inicial`. |
| `movimientos` | Usuario, tipo (`gasto`, `ingreso`, `inversion` y transferencias existentes), importe, fecha, hora, categoría, cuentas asociadas, destinatario, descripción, origen, referencia y estado. |

Los movimientos admiten los estados `confirmado`, `pendiente_revision` y `descartado`. Las categorías de inversiones pertenecen a un tipo distinto y no se mezclan con las de ingresos o gastos. La base de datos utiliza claves foráneas y políticas RLS para evitar que un usuario consulte o modifique registros ajenos.

La incorporación de inversiones se realizó mediante una [migración SQL transaccional](supabase/migrations/20261020_inversiones.sql) que amplía los valores permitidos de `tipo` en las tablas `categorias` y `movimientos`, sin borrar registros anteriores. La migración **debe ejecutarse por separado en cada proyecto Supabase**: publicar el frontend no la aplica automáticamente.

La información se guarda de forma estructurada; **no se conservan los PDF, las imágenes ni el texto OCR completo** como historial de comprobantes.

## Puesta en marcha

### Requisitos

- Node.js compatible con Vite 6 (se utiliza **Node.js 22** en CI).
- Un proyecto propio de **Supabase** con Authentication, PostgreSQL y las tablas/políticas de MERCA configuradas.
- Navegador moderno para la web. Para el flujo automático, un iPhone con **Atajos**.

### 1. Ejecutar el frontend

```bash
git clone https://github.com/BaltazarPatane/MERCA-APP.git
cd MERCA-APP
npm install
cp .env.example .env
```

Completar en `.env` las **variables publicables** del proyecto Supabase:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Iniciar el entorno local:

```bash
npm run dev
```

Para ejecutar las pruebas de la fórmula de balance, compilar y previsualizar:

```bash
npm test
npm run build
npm run preview
```

Las pruebas comprueban que **inversiones y gastos no se contabilicen dos veces**, que pendientes y descartados no alteren el balance y que las transferencias entre cuentas propias no afecten el disponible agregado.

> El repositorio incluye la aplicación web y **migraciones para `destinatario`, `inversiones` y `billeteras`**, pero **no incluye una instalación automatizada del esquema completo de PostgreSQL ni el despliegue completo de la Edge Function**. Para replicar toda la solución es necesario configurar esos componentes en un proyecto Supabase propio.

### 2. Activar Inversiones en Supabase

Antes de registrar aportes en una instalación existente, abrir **Supabase → SQL Editor**, copiar y ejecutar íntegramente [la migración `20261020_inversiones.sql`](supabase/migrations/20261020_inversiones.sql) y verificar que se hayan habilitado los tipos de inversión en `categorias` y `movimientos`.

La migración conserva registros anteriores, claves foráneas y políticas RLS; si encuentra restricciones no previstas se revierte. **Si todavía no se ejecutó, el formulario web de inversiones puede aparecer, pero Supabase rechazará su creación.** Consultar el [procedimiento detallado](docs/inversiones.md).

### 3. Activar billeteras manuales

Ejecutar en **Supabase → SQL Editor** la [migración de billeteras](supabase/migrations/20261105_billeteras_manuales.sql). Añade un saldo de apertura a `cuentas`, políticas RLS propias y validación de que las cuentas vinculadas a movimientos pertenezcan al mismo usuario. No elimina registros antiguos. Seguir los [pasos de configuración y conciliación](docs/billeteras.md).

### 3. Publicar en Cloudflare Pages

La configuración del frontend es:

| Parámetro | Valor |
| --- | --- |
| Repositorio | `BaltazarPatane/MERCA-APP` |
| Rama de producción | `main` |
| Framework | React / Vite |
| Comando de compilación | `npm run build` |
| Carpeta de salida | `dist` |
| Variables públicas | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Los commits integrados a `main` pueden desplegarse automáticamente a través de la integración de GitHub con Cloudflare Pages. La configuración del backend de Supabase es independiente.

### 4. Configurar el atajo en el iPhone

El atajo de uso personal recibe contenido desde el menú **Compartir** de iOS, obtiene texto del PDF o imagen, permite elegir categoría y envía:

```json
{
  "texto_ocr": "Contenido extraído del comprobante",
  "categoria": "Comida"
}
```

a la función HTTPS `smooth-handler`. La autenticación se realiza mediante el encabezado `x-merca-token`, cuyo valor debe coincidir con un secreto configurado exclusivamente en el backend.

Los **secretos administrativos, el token del atajo y cualquier clave de servicio** no deben incorporarse al frontend ni subirse a GitHub.

El código de la Edge Function utilizada en el despliegue del proyecto se administró y publicó **por separado desde Supabase**; la documentación histórica de su integración se encuentra en [`docs/comprobantes.md`](docs/comprobantes.md). No se debe confundir el despliegue de Cloudflare Pages con el de la función.

## Seguridad y privacidad

MERCA se diseñó para mantener **público el código** sin publicar los datos personales:

- **Supabase Authentication** gestiona el acceso a la web.
- **RLS** restringe las operaciones a los registros asociados al usuario autenticado.
- La web utiliza únicamente la **clave publicable** de Supabase.
- Los privilegios del servidor y los secretos de ingesta pertenecen al entorno de **Edge Functions**, nunca al navegador.
- Se evita guardar archivos originales y texto OCR completo.
- El identificador de operación permite detectar reenvíos y reducir la posibilidad de duplicados.

El endpoint de ingesta desde Atajos está configurado para un **usuario propietario**. Crear usuarios adicionales en Supabase no configura automáticamente un atajo independiente para cada uno.

## Evolución del desarrollo

| Etapa | Implementación |
| --- | --- |
| **Captura iOS** | Comparación de alternativas y selección de Atajos para trabajar con PDF e imágenes compartidas. |
| **Persistencia** | Modelado de categorías, cuentas y movimientos en PostgreSQL; integridad referencial y políticas RLS. |
| **Backend** | Edge Function de ingesta, validación de comprobantes, reconocimiento de importe/fecha y prevención de duplicados. |
| **Reconocimiento** | Tratamiento de formatos reales de Mercado Pago, fechas en español, centavos extraídos de PDF e identificación de destinatarios. |
| **Web inicial** | React, autenticación, filtros, historial, resumen, cargas manuales y CSV. |
| **Gestión** | Edición de movimientos, altas y cambios en categorías, revisión de pendientes y asociación opcional de cuentas. |
| **Inversiones** | Tercer tipo manual, categorías propias, historial con filtros y resumen de capital aportado. Migración SQL de integridad y cálculo del balance disponible. |
| **Publicación** | Integración GitHub + Cloudflare Pages, variables de entorno públicas y compilaciones automáticas. |
| **Diseño v2** | Rediseño responsive de las cinco pestañas (Inicio, Movimientos, Inversiones, Agregar y Ajustes), identidad gráfica e ícono de acceso directo para iPhone. |

## Estructura del repositorio

```text
MERCA-APP/
├── public/
│   ├── icon.svg                  # Favicon y marca
│   ├── apple-touch-icon.png      # Acceso directo en iPhone
│   └── manifest.webmanifest      # Metadatos de instalación
├── src/
│   ├── components/
│   │   ├── InicioPanel.tsx
│   │   ├── MovimientosPanel.tsx
│   │   ├── InversionesPanel.tsx
│   │   ├── NuevoMovimientoPanel.tsx
│   │   ├── AjustesPanel.tsx
│   │   ├── GestionCategorias.tsx
│   │   └── EditarMovimiento.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── finanzas.ts             # Balance sin doble contabilización
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── types.ts
├── supabase/migrations/
│   ├── 20261019_destinatario_movimientos.sql
│   └── 20261020_inversiones.sql
├── tests/finanzas.test.mjs       # Pruebas de cálculos financieros
├── docs/
│   ├── comprobantes.md
│   ├── inversiones.md
│   └── img/                      # Portada y seis vistas ilustrativas
├── .github/workflows/            # Test y build en GitHub Actions
├── .env.example
├── index.html
├── package.json
└── README.md
```

## Alcance actual y mejoras posibles

La versión actual cubre el flujo de **gastos enviados desde iPhone** y la administración de finanzas desde la web, pero conserva algunos límites importantes:

- El reconocimiento automático está validado para **determinados formatos de comprobantes**, no para cualquier PDF bancario.
- Si el importe, fecha o estructura son ambiguos, el sistema puede requerir revisión o rechazar la solicitud.
- La exportación CSV utiliza el historial cargado por páginas desde Supabase; **no equivale a un respaldo integral de PostgreSQL**.
- No hay restauración automatizada de respaldos; la carga de movimientos sí utiliza paginación.
- Inversiones registra **aportes**, no valor de mercado, ganancias, dividendos, rentabilidad o rescates automáticos.
- El balance del período es un flujo. El dinero total disponible incluye saldos de apertura y movimientos confirmados, pero **no está sincronizado automáticamente con bancos**.
- Las billeteras se administran manualmente; los comprobantes enviados desde Atajos se conservan sin billetera hasta que el usuario la asigne.
- Para activar **Inversiones** en una base de datos existente es necesario ejecutar [la migración SQL](supabase/migrations/20261020_inversiones.sql), que amplía los tipos permitidos sin borrar registros. **No se ejecuta automáticamente desde GitHub ni Cloudflare.**
- El frontend se despliega desde GitHub, pero la ingesta de comprobantes requiere desplegar y configurar la Edge Function de manera independiente.

## Autor

<div align="center">

**MERCA — Registro y análisis de finanzas personales**

Diseño, desarrollo e integración por **Baltazar Patané**.

*React · TypeScript · PostgreSQL · Supabase · Automatización con Atajos iOS*

</div>
