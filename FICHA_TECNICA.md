# Teo — Ficha técnica y plan de arranque

> **Documento vivo.** Es la fuente de verdad del producto antes y durante el desarrollo. Cada decisión nueva se agrega en la sección 18 y se anota en el registro de cambios (sección 20).
>
> Versión 0.1 · 20/11/2026 · Estado: **borrador para revisión**. Todavía no hay código.

---

## Índice

1. Resumen ejecutivo
2. Marca aplicada al producto
3. Usuarios y roles
4. Alcance por fases
5. Flujo de punta a punta
6. Modelo del caso (Kanban) y máquina de estados
7. Agente Teo (IA)
8. Integración con WhatsApp
9. Fuentes de contexto (catálogo, tiendas, Google Places)
10. Arquitectura técnica
11. Modelo de datos
12. Dashboard: módulos y UX
13. Seguridad, privacidad y cumplimiento
14. Calidad: testing y evals del agente
15. Observabilidad y operación
16. Métricas de producto (KPIs)
17. Costos estimados
18. Decisiones (tomadas y abiertas)
19. Plan de trabajo
20. Registro de cambios

---

## 1. Resumen ejecutivo

**Qué es:** Teo es un asistente de IA que atiende el WhatsApp de un comercio. Vende, organiza a los clientes por estado y le da al equipo del comercio un panel para supervisar y responder.

**Promesa de marca:** *"Tus conversaciones. Tus clientes. Todo bajo control."* · *"Convierte tus conversaciones en ventas."*

**Propósito:** ayudar a cualquier comercio a gestionar sus ventas y conversaciones de forma simple e inteligente.

**Objetivo operativo del MVP:** cada conversación que inicia un cliente termina en una de dos salidas:
- una **venta en espera de pago**, que el equipo del comercio confirma y cierra; o
- una **consulta resuelta**.

**Principios del producto**

1. **Teo nunca inicia una conversación** en la Fase 1. Solo responde. Las campañas salientes llegan en la Fase 2.
2. **Teo no inventa nada.** Precios, stock, horarios y políticas salen únicamente del contexto que cargó el comercio.
3. **Un humano puede intervenir siempre.** Cualquier conversación se puede pasar de Teo al operador y de vuelta.
4. **Multi-comercio desde el día 1.** El aislamiento de datos entre comercios no se negocia.
5. **Simple para el comercio.** El onboarding completo debería tomar menos de 30 minutos.

---

## 2. Marca aplicada al producto

Fuente: `TEO_Brand_Kit_v1.0/`. El manual raster (`08_Manual_de_Marca/Manual_visual_original.png`) es la autoridad visual. Lo que el manual no especifica (radios, sombras, escala tipográfica, pesos) se define en el design system del producto (sección 12.4) y se registra como decisión.

### 2.1 Tokens de color (del manual)

| Token | HEX | Uso según el manual | Uso en producto (propuesto) |
|---|---|---|---|
| `--teo-azul-teo` | `#0B1F3A` | Principal. Confianza y tecnología. | Sidebar, encabezados, texto principal en modo claro, fondo en modo oscuro |
| `--teo-verde-inteligente` | `#00D97E` | Acciones, crecimiento y ventas. | CTA primario, estado "Venta cerrada"/"Pagado", indicadores positivos |
| `--teo-lila-de-acento` | `#D9D6FF` | Apoyo en fondos y elementos de interfaz. | Superficies secundarias, chips, burbujas de Teo, sugerencias de IA |
| `--teo-blanco-nube` | `#F5F8FC` | Fondos, superficies y claridad. | Fondo de la app en modo claro |
| `--teo-blanco` | `#FFFFFF` | Contraste y limpieza. | Tarjetas, paneles |
| `--teo-gris-interfaz` | `#64748B` | Textos secundarios, bordes y estados. | Texto secundario, bordes, iconos inactivos |

**Faltantes que hay que definir** (no están en el manual): colores semánticos de error, advertencia e información, y los colores de los estados del Kanban. La referencia del dashboard del manual muestra chips en verde ("Nuevo", "Venta cerrada"), lila ("En conversación") y amarillo ("Cotización"). Se propone completar la paleta con amarillo (advertencia/espera), rojo (bloqueado/error) y azul claro (info), y validar el contraste AA.

> ⚠️ El verde `#00D97E` sobre blanco **no cumple el contraste AA para texto**. Se usa como fondo de botón con texto `#0B1F3A`, nunca como color de texto sobre claro.

### 2.2 Tipografía

- **Plus Jakarta Sans:** titulares, marca y comunicación clave.
- **Inter:** interfaz, textos largos y componentes. Es la fuente por defecto del dashboard.
- Ambas están en Google Fonts (licencia OFL) y se cargan con `next/font`.

### 2.3 Iconografía

El manual pide iconos simples, de trazo redondeado y consistentes. Usaremos **Lucide** (que ya se usa en otros proyectos del equipo), con este mapeo a los 10 iconos del manual:

| Manual | Lucide |
|---|---|
| conversaciones | `MessageCircle` |
| clientes | `Users` |
| estados/capas | `Layers` |
| filtro ventas | `Filter` |
| estadísticas | `BarChart3` |
| etiqueta | `Tag` |
| calendario | `Calendar` |
| completado | `CircleCheck` |
| automatización | `Zap` |
| configuración | `Settings` |

### 2.4 Voz y tono (aplica también a los mensajes que Teo envía por WhatsApp)

Cercana, clara y orientada a la acción: breve y natural, positiva y proactiva, enfocada en resultados, sin tecnicismos.
Personalidad: **inteligente, amigable, ágil, confiable, resolutiva.**

**Importante:** hacia el cliente final, Teo habla **con la voz del comercio**. El tono base es el de Teo, pero cada comercio lo ajusta (formal o informal, tuteo o usted, emojis sí o no). La marca Teo no aparece en los chats del cliente final salvo que el comercio lo active.

### 2.5 Personaje y logo

- **Isotipo:** avatar, favicon y app. Mínimo 24 px.
- **Logo horizontal:** mínimo 120 px. Área de protección igual a la altura de la "T".
- **Personaje:** se usa en estados vacíos, onboarding y la bienvenida ("¡Hola! Soy Teo"). Solo con las poses existentes; no se crean nuevas.
- **Pendiente con diseño:** logo maestro en SVG y PNG con transparencia. El kit actual solo trae recortes raster con fondo.

---

## 3. Usuarios y roles

| Rol | Quién es | Puede |
|---|---|---|
| **Owner** | Dueño del comercio | Todo: facturación, conexiones, usuarios, configuración de Teo |
| **Admin** | Gerente | Catálogo, tiendas, configuración de Teo, ver todos los casos, reportes |
| **Operador** | Vendedor o atención al cliente | Ver y responder casos asignados o sin asignar, mover estados, confirmar pagos |
| **Cliente final** | Persona que escribe por WhatsApp | Solo interactúa por WhatsApp; no tiene acceso al panel |
| **Superadmin Teo** | Equipo interno de Teo | Panel `/admin`: administra **todos** los comercios, con soporte, métricas globales, costos de IA, suspensión e impersonación auditada (sección 12.5) |

Un usuario del panel puede pertenecer a varios comercios (por ejemplo, una agencia o un dueño de varias marcas).

---

## 4. Alcance por fases

### Fase 1: MVP (alcance de este plan)

- Registro e inicio de sesión del comercio, y creación de la organización.
- Onboarding guiado: datos del negocio, tiendas, horarios, catálogo con fotos, métodos de pago, políticas y FAQs.
- Importación desde **Google Places** (perfil, dirección, horarios, teléfono, fotos y reseñas como contexto).
- Importación del catálogo por CSV o Excel, además de la carga manual.
- Conexión del número de WhatsApp (Meta Cloud API con Embedded Signup).
- Agente Teo que responde, cotiza, arma el pedido y envía los datos de pago.
- Recepción del comprobante (foto o PDF), que deja el caso en "Pago por confirmar".
- Panel Kanban de casos, chat en vivo con respuestas sugeridas por Teo, y paso de Teo a humano y de vuelta.
- Confirmación manual del pago y cierre del caso.
- Ficha del cliente (contacto, historial de casos, notas, etiquetas).
- Métricas básicas: conversaciones, ventas, conversión y tiempo de respuesta.
- Notificaciones al operador (en el panel, y por email o push web).

### Fase 2

- Campañas y mensajes salientes con plantillas aprobadas por Meta (recordatorio de pago, carrito abandonado, promociones).
- Automatización de la confirmación de pagos (lectura de comprobantes por IA, conciliación bancaria, links de pago con pasarela).
- Integración con CRM y ERP (sincronización de clientes, inventario y pedidos).
- Transcripción de notas de voz (si no entra antes; ver D-07).
- Multi-número por comercio (una línea por tienda).
- App móvil o PWA para operadores.

### Fase 3 (ideas)

- Instagram y Messenger en la misma bandeja.
- Recomendaciones proactivas y reactivación de clientes.
- Analítica avanzada (cohortes, LTV, productos más consultados).

### Fuera de alcance

- Grupos de WhatsApp.
- Números no oficiales (Baileys, Evolution API). Se descartan por riesgo de bloqueo; ver D-02.

---

## 5. Flujo de punta a punta

### 5.1 Onboarding del comercio

```
1. Registro (email + contraseña / Google) → crea Organización
2. Perfil del negocio
   ├─ Buscar en Google Places → autocompleta nombre, dirección, horarios, teléfono, fotos
   └─ Ajustes manuales: descripción, rubro, tono de voz, políticas (envíos, devoluciones)
3. Tiendas / sucursales (dirección, horarios, zona de cobertura de envío)
4. Catálogo
   ├─ Manual (nombre, descripción, precio, variantes, fotos, stock opcional, categoría)
   └─ Importar CSV/Excel
5. Métodos de pago (transferencia: banco/cuenta/titular; efectivo contra entrega; link de pago externo)
6. Configurar Teo
   ├─ Nombre visible, tono, saludo, horario de atención, mensaje fuera de horario
   ├─ Modo: Piloto automático | Copiloto (solo sugiere) 
   └─ Reglas de escalamiento (palabras clave, montos altos, reclamos)
7. Probar a Teo en un simulador de chat dentro del panel (antes de conectar el número real)
8. Conectar WhatsApp (Embedded Signup de Meta)
9. ✅ Teo activo
```

**Criterio de "listo para activar":** al menos 1 tienda, 1 producto, 1 método de pago y un número conectado. El panel muestra una checklist de progreso.

### 5.2 Operación: conversación entrante

```
Cliente escribe por WhatsApp
  → Webhook Meta → se guarda el mensaje (idempotente por wamid)
  → ¿Existe contacto? si no, se crea
  → ¿Tiene un caso abierto? si no, se crea caso nuevo (estado NUEVO)
  → Debounce (espera ~4 s por si el cliente manda varios mensajes seguidos)
  → ¿El caso está en modo humano? → solo notifica al operador + genera sugerencia
  → Si no: Agente Teo procesa
       ├─ Clasifica intención: compra | consulta | postventa | reclamo | otro
       ├─ Usa herramientas (catálogo, tiendas, cotizar, armar pedido, datos de pago)
       ├─ Actualiza estado del caso
       └─ Responde por WhatsApp
  → Dashboard se actualiza en tiempo real
```

### 5.3 Ciclo de venta (el camino feliz)

1. El cliente pregunta por un producto. El caso pasa a **En conversación**.
2. Teo muestra opciones, precios y fotos, y resuelve dudas.
3. Teo arma la cotización o el pedido (ítems, cantidades, entrega o retiro, total). El caso pasa a **Cotización**.
4. El cliente acepta. Teo envía los datos de pago y el resumen. El caso pasa a **Esperando pago**.
5. El cliente envía el comprobante. Teo lo adjunta al pedido y responde "Recibido, lo estamos verificando". El caso pasa a **Pago por confirmar**.
6. El operador revisa y presiona **Confirmar pago**. Teo envía la confirmación al cliente. El caso pasa a **Confirmado**.
7. El operador cierra el caso (o se cierra solo tras la entrega o N días). El caso pasa a **Cerrado (ganado)**.
8. Si el cliente vuelve a escribir para otra compra, se abre un **caso nuevo** ligado al mismo contacto.

### 5.4 Consultas sin venta

Si la intención es solo una consulta (horarios, ubicación, si hay stock), el caso se marca como tipo `consulta`. Teo responde y, cuando la consulta queda resuelta o pasan X horas sin actividad, el caso pasa a **Resuelto**. Si en medio de la consulta aparece una intención de compra, el caso se convierte en tipo `venta` sin abrir otro.

### 5.5 Paso a humano

Teo pasa el caso a un humano (estado **Requiere atención**) cuando:
- el cliente lo pide ("quiero hablar con una persona");
- hay un reclamo o se detecta un sentimiento negativo fuerte;
- falta información para responder (Teo no sabe y no debe inventar);
- el monto supera el umbral configurado;
- hay un error técnico o 2 intentos fallidos de entender al cliente.

Al pasar a humano, Teo deja de responder solo y sigue generando **respuestas sugeridas**. El operador puede devolver el caso a Teo con un botón.

---

## 6. Modelo del caso (Kanban) y máquina de estados

### 6.1 Entidades

- **Contacto:** la persona (teléfono de WhatsApp único por comercio).
- **Caso:** una conversación con un objetivo (venta o consulta). Un contacto tiene muchos casos y como máximo **un caso abierto** a la vez.
- **Pedido:** lo que se vende dentro de un caso de tipo venta.

### 6.2 Columnas del tablero

| Columna | Estado (`case_status`) | Quién lo mueve | Color sugerido |
|---|---|---|---|
| Nuevo | `nuevo` | sistema | verde suave |
| En conversación | `en_conversacion` | Teo / operador | lila |
| Cotización | `cotizacion` | Teo / operador | amarillo |
| Esperando pago | `esperando_pago` | Teo / operador | amarillo intenso |
| Pago por confirmar | `pago_por_confirmar` | Teo (al recibir comprobante) | azul |
| Confirmado | `confirmado` | operador | verde |
| Requiere atención | `requiere_atencion` (bloqueado) | Teo / operador | rojo |
| Cerrado | `cerrado_ganado` / `cerrado_perdido` / `resuelto` | operador / sistema | gris |

La vista principal oculta los cerrados, que quedan disponibles con un filtro.

### 6.3 Transiciones

```
nuevo ──► en_conversacion ──► cotizacion ──► esperando_pago ──► pago_por_confirmar ──► confirmado ──► cerrado_ganado
   │             │                │               │                    │
   │             └──► resuelto (consulta)         │                    └──► esperando_pago (comprobante rechazado)
   │                                              └──► cerrado_perdido (expira / cliente desiste)
   └──────── cualquier estado abierto ◄──► requiere_atencion (guarda estado previo)
```

Reglas:
- Las transiciones se validan en el backend con una función única (`transition_case()`) que registra un evento en `case_events` (quién, cuándo, de qué estado a cuál y por qué).
- **Expiración:** si un caso está en `esperando_pago` sin actividad por N horas (configurable, por defecto 48 h), pasa a `cerrado_perdido`. En la Fase 2 se envía un recordatorio con plantilla antes de cerrarlo.
- **Ventana de 24 h de Meta:** pasadas 24 h desde el último mensaje del cliente, no se pueden enviar mensajes libres. El panel lo indica en la UI ("Ventana cerrada: solo plantilla").

### 6.4 Asignación

- Casos sin asignar, visibles para todos los operadores.
- Asignación manual o automática al tomar el caso ("Tomar caso").
- En la Fase 2: reparto automático (round-robin por tienda).

---

## 7. Agente Teo (IA)

### 7.1 Modos de operación (por comercio y por caso)

| Modo | Comportamiento |
|---|---|
| **Piloto automático** | Teo responde solo y escala según las reglas. Es el modo por defecto. |
| **Copiloto** | Teo no envía nada. Solo genera sugerencias, y el operador las aprueba, edita o descarta. Ideal para la primera semana del comercio. |
| **Humano** | El caso está tomado por un operador. Teo solo sugiere. |

### 7.2 Modelos (Claude, API de Anthropic)

| Uso | Modelo propuesto | Notas |
|---|---|---|
| Agente conversacional (tool use) | `claude-opus-5-5` con effort `low`/`medium` | Es el modelo por defecto. Hay que medir la latencia en WhatsApp; ver D-05. |
| Respuestas sugeridas para el panel | el mismo modelo del agente | Reutiliza el contexto cacheado. |
| Clasificación de intención, resúmenes de caso, extracción de datos del comprobante | `claude-haiku-5-5` | Volumen alto y bajo costo. |
| Embeddings para búsqueda semántica del catálogo | a definir (ver D-06) | Anthropic no ofrece embeddings propios. |

Notas técnicas de la API vigente (noviembre de 2026), para no tropezar:
- Usar thinking adaptativo y controlar la profundidad con `output_config.effort`. `budget_tokens` y `temperature` ya no aplican.
- No hay *prefill*. El formato de salida se controla con *structured outputs* (`output_config.format`) o con herramientas `strict: true`.
- `tool_choice` forzado (`any`/`tool`) devuelve 400 en Opus 5.5. Se usa `auto` y se dirige el comportamiento desde el prompt.
- Hay que manejar `stop_reason: "refusal"` y activar los `fallbacks` del servidor.
- **Prompt caching:** el orden es herramientas → system (instrucciones fijas de Teo) → contexto del comercio (catálogo resumido, tiendas, políticas) → historial. Se pone un breakpoint de cache tras el contexto del comercio. Nada volátil (fecha y hora, ids) va antes del breakpoint; la hora actual se pasa como mensaje de sistema a mitad de la conversación.
- SDK: `@anthropic-ai/sdk` (TypeScript), con su *Tool Runner* y herramientas Zod.

### 7.3 Estructura del prompt

```
[system – estático, cacheado, igual para todos los comercios]
  Identidad y reglas de Teo (vende con la voz del comercio, nunca inventa precios/stock,
  pide confirmación antes de crear pedido, formato WhatsApp: mensajes cortos, sin markdown pesado,
  cuándo escalar, cómo manejar fuera de horario, privacidad)
[system – por comercio, cacheado]
  Perfil del negocio, tono, tiendas y horarios, métodos de pago, políticas, FAQs,
  resumen del catálogo (categorías + top productos)
[mensajes]
  Resumen del historial del contacto (casos anteriores)
  Estado actual del caso + pedido en borrador
  Últimos N mensajes de la conversación
  Mensaje de sistema volátil: fecha/hora local, ¿tienda abierta?, ventana 24h
```

### 7.4 Herramientas (tool calling)

| Herramienta | Qué hace |
|---|---|
| `buscar_productos(query, categoria?, precio_max?)` | Búsqueda híbrida (texto + semántica) en el catálogo del comercio |
| `ver_producto(id)` | Detalle, variantes, precio y stock |
| `enviar_fotos_producto(id, n)` | Envía hasta N imágenes del producto por WhatsApp |
| `consultar_tiendas(ubicacion?)` | Tiendas, horarios y si están abiertas ahora |
| `consultar_politicas(tema)` | Envíos, devoluciones, garantías, FAQs |
| `actualizar_pedido(items[], entrega)` | Crea o edita el pedido en borrador y recalcula el total en el backend (el LLM nunca calcula precios) |
| `confirmar_pedido()` | Pasa a `esperando_pago` y devuelve los datos de pago para enviar |
| `registrar_comprobante(media_id)` | Adjunta el comprobante y pasa a `pago_por_confirmar` |
| `actualizar_datos_cliente(nombre?, direccion?, email?)` | Completa la ficha del contacto |
| `escalar_a_humano(motivo)` | Pasa a `requiere_atencion` y notifica |
| `marcar_consulta_resuelta()` | Cierra un caso de tipo consulta |

**Guardrails:**
- Los precios y totales siempre vienen del backend.
- Toda herramienta valida que el recurso pertenezca al `org_id` del caso. Al agente nunca se le pasa el `org_id`: lo inyecta el servidor.
- Hay un máximo de iteraciones de herramientas por turno (por ejemplo, 6) y un timeout. Si se exceden, se escala a humano.
- Los mensajes salientes se pasan por una validación (largo, sin datos de otros clientes, sin URLs no permitidas).

### 7.5 Memoria y contexto

- **Corto plazo:** los últimos ~30 mensajes del caso, más el estado y el pedido.
- **Largo plazo:** un resumen del contacto (preferencias, compras anteriores) generado con Haiku al cerrar cada caso.
- **Catálogo grande:** no se mete entero en el prompt; se consulta con `buscar_productos`. Con menos de unos 50 productos, se puede incluir completo en el bloque cacheado.

### 7.6 Respuestas sugeridas (panel)

Al abrir un caso, o cuando llega un mensaje con el caso en modo humano o copiloto, se generan entre 1 y 3 sugerencias, con acciones propuestas (por ejemplo: "Enviar datos de pago" o "Mover a Cotización"). El operador puede usarlas tal cual, editarlas o pedir otra ("más corto", "más formal").

### 7.7 Multimedia entrante (Fase 1)

- **Imagen o PDF:** si el caso está en `esperando_pago`, se trata como posible comprobante. Haiku extrae monto, fecha, banco y referencia como ayuda al operador; **no se confirma automáticamente**. En otro estado, Teo la describe y responde (por ejemplo, "¿Tienen este modelo?").
- **Audio:** ver D-07. Si no se transcribe, Teo responde con amabilidad que por ahora lee mensajes de texto.
- **Ubicación:** se usa para elegir la tienda más cercana o calcular el envío.

---

## 8. Integración con WhatsApp

### 8.1 Proveedor: **Meta WhatsApp Cloud API (oficial)**

- Teo se registra como **Tech Provider** de Meta (verificación de negocio + app review) para conectar números de terceros con **Embedded Signup**. Es el camino crítico: hay que iniciar el trámite en la semana 1.
- **Coexistencia:** Meta permite que el comercio siga usando la app WhatsApp Business en su teléfono mientras su número está conectado a la Cloud API. Es clave para los comercios que no quieren perder su número ni su app. Hay que validar la disponibilidad en Ecuador y las limitaciones (ver D-03).
- Alternativa si el trámite de Tech Provider demora: un BSP (360dialog, Twilio, Gupshup) como intermediario. Agrega costo, pero acelera el inicio.

**Cómo lo hacía country-gpt:** **no** era Tech Provider. Usaba la Cloud API directa con **su propia app y su propio número**, con un único `WHATSAPP_TOKEN` global (`.ref/supabase/supabase/functions/_shared/whatsapp/client.ts:24`). Eso sirve cuando el número es tuyo; Teo, en cambio, necesita conectar números **de terceros** (los comercios).

| Opción | Tiempo hasta el primer comercio | Costo extra | Escala |
|---|---|---|---|
| A. Directo, como country-gpt: el número del comercio se registra en la WABA de Teo | Días (el display name lo revisa Meta) | Ninguno | Mala: el comercio no es dueño de su WABA, el alta es manual y no hay coexistencia |
| B. Tech Provider + Embedded Signup | Semanas: verificación del negocio + App Review + configuración. **Es el camino más largo** | Ninguno | La mejor: self-service, cada comercio es dueño de su WABA y hay coexistencia |
| C. BSP intermediario (360dialog, Twilio…) | Días: ya tienen su onboarding listo | Cuota mensual por número + dependencia del proveedor | Buena, pero con margen menor |

**Requisito de producto (20/11/2026):** el comercio tiene que poder usar Teo **apenas termina el onboarding**, sin intervención manual de nuestro equipo. Eso exige **Embedded Signup**: el comercio pulsa "Conectar WhatsApp", inicia sesión con Facebook, elige o crea su cuenta, verifica su número y queda activo en minutos. Con coexistencia, además sigue usando su app de WhatsApp Business.

**Estrategia decidida:** **B. Tech Provider**. La opción A queda descartada porque es manual. El trámite con Meta empieza en la **semana 1** y corre en paralelo con el desarrollo. WhatsApp real recién se necesita en las semanas 5–6 (Fase 3), así que hay margen para la aprobación. **Plan de contingencia:** si en la semana 5 Meta no aprobó, se usa un BSP que ya ofrezca Embedded Signup (C) para no frenar el piloto, y se migra al Tech Provider propio después. *Los plazos de Meta varían; hay que validarlos al iniciar el trámite.*

Implicancias para el producto:
- Paso "Conectar WhatsApp" en el onboarding con el SDK de Facebook (Embedded Signup). Al terminar se guarda `waba_id`, `phone_number_id` y el token del negocio (en Vault), se suscribe la app a los webhooks de la WABA y se registra el número.
- Si el comercio no tiene un número disponible: guía en pantalla (número nuevo, o coexistencia con su app de WhatsApp Business).
- Una WABA nueva tiene límites bajos para mensajes **iniciados por el negocio**. Eso no afecta a Teo en la Fase 1, porque solo responde.
- Estado de conexión visible en Configuración → WhatsApp (activo, pendiente de verificación, calidad del número).

### 8.2 Webhook

- Un endpoint por app (Edge Function `webhook`, ruta `/webhook/whatsapp`), común a todos los comercios. El comercio se resuelve por `phone_number_id`.
- Verificación del `hub.challenge` (GET) y de la firma `X-Hub-Signature-256` con el App Secret (POST).
- **Idempotencia:** unique sobre `wamid`. Meta reintenta, así que los duplicados se ignoran.
- Se responde 200 en menos de 1 s: el webhook solo persiste y encola, nunca procesa la IA en línea.
- Se procesan también los **statuses** (sent, delivered, read, failed) para actualizar los ticks en el panel.

### 8.3 Envío

- Graph API `POST /{phone_number_id}/messages`: texto, imagen, documento, mensajes interactivos (botones y listas, útiles para elegir variante o confirmar el pedido) y reacciones.
- **Token por comercio** (el que devuelve Embedded Signup), guardado cifrado (Supabase Vault).
- Se respetan los límites de mensajes y la ventana de 24 h.
- **Plantillas:** en la Fase 1 solo `utility` para casos puntuales (por ejemplo, la confirmación de pago fuera de la ventana). Su gestión completa llega en la Fase 2.

### 8.4 Media

- La media entrante se descarga con el `media_id` (las URLs de Meta expiran) y se guarda en Supabase Storage, en un bucket privado por organización.
- La media saliente (fotos de productos) sale de URLs firmadas de Storage o se sube a Meta y se reutiliza el `media_id`.

---

## 9. Fuentes de contexto

### 9.1 Carga manual y archivos

- Formularios del panel para el negocio, las tiendas, el catálogo, los pagos, las políticas y las FAQs.
- Importación de CSV o Excel con mapeo de columnas y vista previa.
- Las fotos se suben a Storage y se generan miniaturas.
- **Base de conocimiento libre:** el comercio puede pegar texto o subir PDFs (menú, lista de precios, políticas). Se trocean y se indexan para RAG.

### 9.2 Google Places

- **Places API (New):** *Text Search / Autocomplete* para encontrar el negocio y *Place Details* para traer los datos.
- Se importan: nombre, dirección, coordenadas, teléfono, horarios, sitio web, categoría, fotos y reseñas recientes. Las reseñas sirven de contexto, por ejemplo para entender qué valoran los clientes.
- **Ojo con los términos de Google:** solo el `place_id` se puede guardar indefinidamente, y el resto del contenido tiene límites de caché. Por eso los datos importados se tratan como **sugerencia**: el comercio los revisa y confirma, y quedan como datos propios del comercio. Se re-sincroniza a pedido. Hay que validar con legal (ver D-08).
- Una tienda del comercio corresponde a un `place_id`.

### 9.3 CRM y otras plataformas (Fase 2)

- Una interfaz de "conectores" genérica (`integrations` + jobs de sincronización), pensada desde ahora en el modelo de datos pero no implementada en la Fase 1.

---

## 10. Arquitectura técnica

### 10.1 Base técnica: qué aprendemos de context-gpt (country-gpt)

> **Regla:** Teo se construye **de cero**, en un repo nuevo. country-gpt es un producto distinto y solo sirve como **referencia** de cómo resolvimos el manejo del contexto (conocimiento, RAG, historial y prompts) y la conexión con WhatsApp. **No se copia código** de forma directa: los patrones se reimplementan limpios, con tests, para el dominio de Teo.

Repositorios de referencia, clonados en `.ref/` (solo lectura, **no se versionan con Teo**):
- Backend: [context-gpt/supabase](https://github.com/context-gpt/supabase): Supabase Edge Functions (Deno 2 + Hono), Postgres 17, pgvector, pg_cron y pg_net, Upstash Redis, un proveedor LLM compatible con OpenAI, WhatsApp Cloud API (Graph v21) y unos 500 tests con `Deno.test`.
- Dashboard: [context-gpt/dashboard](https://github.com/context-gpt/dashboard): Next.js 16 + React 19.2 + Tailwind 4, sin librería de componentes. Desplegado en EC2 con Docker.

**Conclusión:** del backend tomamos como **base conceptual** el webhook, el cliente de WhatsApp, la abstracción del LLM, el RAG con pgvector, el patrón de dependencias inyectables y los tests. **Todo se escribe de nuevo**, con el modelo de datos, el multi-comercio y la seguridad de Teo. Del dashboard solo se toman referencias visuales y de UX.

#### Backend: patrones a reimplementar (consultar en `.ref/supabase/supabase/functions/`)

| Referencia | Qué aprendemos para Teo | Qué hacemos distinto |
|---|---|---|
| `_shared/whatsapp/verify.ts` | Verificación HMAC `X-Hub-Signature-256` en tiempo constante | Ninguno |
| `_shared/whatsapp/client.ts` + `types.ts` | Envío de texto, botones y "escribiendo…" | Token **por comercio** (Vault); agregar listas, media, plantillas y statuses; actualizar la versión de Graph |
| `webhook/index.ts` (Hono + fast-ack con `EdgeRuntime.waitUntil`) | Patrón del webhook | Procesar **todos** los `entry/changes/messages` y los `statuses`; encolar en lugar de procesar en línea |
| `_shared/llm/provider.ts` + idea de `router.ts` | Abstracción del LLM y presupuestos de tokens por tarea | Cambiar el proveedor por defecto a Claude (`@anthropic-ai/sdk`); el router enruta por tarea (agente, sugerencias, clasificación, extracción) |
| `_shared/llm/embeddings.ts` + migraciones `knowledge_store` / `match_knowledge` (HNSW) | RAG del catálogo, FAQs y documentos | Pasar de `tenant_id` a `org_id`; sin categorías de Venezuela |
| `_shared/pipeline/executor.ts` + `types.ts` | Sincronización de fuentes externas (Google Places y CRM en la Fase 2) con reintentos y registro de ejecuciones | — |
| `_shared/logger.ts` | Logs estructurados | Sin el buffer en memoria expuesto |
| Patrón de `deps` inyectables + `*_test.ts` + `.github/workflows/deploy.yml` | Testing y CI/CD | Correr tests **con** chequeo de tipos y `supabase db reset` en CI |

#### Backend: ideas que inspiran (con diseño nuevo)

- **`webhook/handlers/process_message.ts`** (monolito de 840 líneas con `if/return`): se reescribe como un **orquestador** con la máquina de estados del caso (sección 6) persistida en Postgres, más el agente con herramientas (sección 7). `_shared/handlers/upgrade_flow.ts` (selección → esperando pago → referencia) es el prototipo más cercano al flujo de venta.
- **Clasificador** (fast-path + LLM con JSON): se conserva el fast-path para saludos y "hablar con humano"; el resto lo resuelve el agente con tool calling.
- **Cadena de fallback** (caché → plantillas → RAG → LLM → "no sé"): se mantiene la idea de degradar con elegancia, pero el último nivel es **escalar a humano**, no responder "no tengo información".
- **`admin/verify-payment`**: es la base de la columna "Pago por confirmar". Se guarda el comprobante y la referencia **en claro** (protegidos con RLS) y se notifica al cliente por WhatsApp al aprobar o rechazar.
- **Rate limiter y monitor de seguridad:** operaciones atómicas (`INCR`/`SET NX`) y menos falsos positivos. Frases como "actúa como" no deben bloquear a un cliente real.
- **Circuit breaker y `cost_log`:** el código existía pero **no estaba conectado**. En Teo, cada llamada al LLM registra su `usage` real en `agent_runs` y hay un tope de costo diario **por comercio**.

#### Backend: no aplica a Teo

Fuentes de Venezuela (`pipeline/sources/*`: dólar, BCV, noticias, Hidrocapital), conversor de moneda, crowd reports, modo turista, rachas y engagement, tiers free/pro/atlas del usuario final (en Teo la suscripción es del **comercio**), `template_generator.ts` (LLM al escribir, caro) y la taxonomía de intents y textos fijos.

#### Dashboard: referencias a tomar

- Tipos y acciones de catálogo, horarios (upsert de 7 días), FAQs y promociones (`src/lib/types.ts`, `src/app/actions/business.ts`). Hay que agregarles autorización y filtro por organización.
- La burbuja de chat estilo WhatsApp (`src/app/(dashboard)/conversations/[userId]/page.tsx`) como referencia visual.
- La cola de pagos manuales (`payments`) como referencia de UX.
- El flujo de Stripe (onboarding y webhook con firma verificada), si se elige Stripe para cobrar a los comercios (D-10).

#### Errores de context-gpt que Teo no debe repetir

1. **RLS abierta:** las políticas `USING (true)` sin `TO service_role` dejan todo legible y escribible con la anon key. En Teo: membresías + `auth.uid()` y tests de RLS en CI.
2. **Secretos en el repo y en tablas:** había una service-role key en scripts y en la tabla `app_config`, y datos bancarios en el código. En Teo: Vault y `supabase secrets`, `.env.example` solo con nombres y escaneo de secretos (gitleaks) en CI.
3. **Server Actions sin autorización e IDOR** (dashboard): toda acción valida sesión, membresía y `org_id`. Nunca se usa el cliente con service role en el panel.
4. **Multi-tenant por país con un token global:** en Teo el tenant es el **comercio**, se resuelve por `phone_number_id` y cada uno tiene su propio token.
5. **Idempotencia en memoria:** en Teo se hace con `wamid UNIQUE` en Postgres.
6. **Conversaciones solo en Redis (30 min):** en Teo, todos los mensajes se guardan en Postgres (Kanban, historial, ventana de 24 h).
7. **Auth casera con JWT y bcrypt:** en Teo, Supabase Auth.
8. **Endpoints `/simulate` y `/debug-logs` en producción con datos reales:** en Teo, el simulador vive en el panel, autenticado y con datos de prueba.
9. **Deploy sin CI** (el dashboard): en Teo, lint, typecheck y tests antes de cada deploy.

> 🔴 **Acción urgente (fuera de Teo):** el repo `context-gpt/supabase` tiene versionada la **service-role key de producción** (`scripts/simulate-message.sh`, `scripts/db-query.sh`) y el token de verify/admin (`scripts/e2e-simulate.sh`, `.claude/skills/sim-bot/SKILL.md`). Hay que **rotarlos ya** y revisar las políticas RLS de ese proyecto.

### 10.2 Stack propuesto

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend (panel) | **Next.js 16 (App Router) + React 19.2 + TypeScript strict** | La misma versión que el dashboard de context-gpt; en Next 16 el middleware se llama `proxy.ts` |
| UI | **Tailwind CSS 4 + shadcn/ui + Lucide**, `next-themes`, `sonner` | Velocidad, accesibilidad y modo oscuro |
| Kanban | `@dnd-kit` | Drag & drop accesible |
| Estado y datos en el cliente | TanStack Query + Supabase Realtime | Caché e invalidación en tiempo real |
| Validación y formularios | **Zod** + react-hook-form | Zod es compartido entre el front, la API y las herramientas del agente |
| Tablas | TanStack Table | Clientes, catálogo y pedidos |
| Backend del panel | Server Actions y Route Handlers de Next.js en **Vercel**, con `@supabase/ssr` y la sesión del usuario (RLS) | Cada acción valida sesión, membresía y `org_id` |
| Webhook WhatsApp + worker del agente | **Supabase Edge Functions (Deno 2 + Hono)** | Es el patrón probado en context-gpt: respuesta rápida a Meta y cerca de la base de datos (D-04) |
| Base de datos | **Supabase Postgres** + RLS + `pgvector` + `pg_trgm` | Multi-tenant, búsqueda híbrida |
| Colas | **Supabase Queues (`pgmq`)** + `pg_cron` + `pg_net` | Procesamiento asíncrono, reintentos, debounce y expiraciones |
| Caché y rate limit | Postgres en el MVP; **Upstash Redis** (ya usado en context-gpt) solo si hace falta | Una dependencia menos al inicio |
| Auth | **Supabase Auth** (email, magic link, Google) | |
| Archivos | **Supabase Storage** (buckets privados por organización) | Fotos, comprobantes, media |
| Secretos por comercio | **Supabase Vault** | Tokens de WhatsApp |
| IA | **Anthropic API** (`npm:@anthropic-ai/sdk` desde Deno) detrás de la abstracción `_shared/llm/provider.ts` | Ver la sección 7.2. La abstracción permite cambiar de proveedor |
| Embeddings | `text-embedding-3-small` (1536 dimensiones, como en context-gpt) | Ver D-06 |
| Email transaccional | Resend | Invitaciones y notificaciones |
| Errores y logs | Sentry + logs de Vercel y Supabase | |
| Pagos de la suscripción del comercio | a definir (Fase 1.5) | Ver D-10 |

### 10.3 Diagrama

```
                ┌───────────────────┐
 Cliente final ─┤  WhatsApp (Meta)  │
                └─────────┬─────────┘
                webhook   │   ▲ Graph API (send)
                          ▼   │
┌─────────────────────────────────────────────────────────────┐
│ Vercel – Next.js 16                                         │
│  Panel (App Router) ── Server Actions ── Supabase (RLS)     │
│  (envía respuestas del operador vía Edge Fn "send")         │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│ Supabase                                                    │
│  Postgres (RLS, pgvector, pg_trgm, pgmq, pg_cron, Vault)    │
│  Realtime ──────────────► Panel (casos/mensajes en vivo)    │
│  Storage (media, catálogo, comprobantes)                    │
│  Edge Fn "webhook" (Hono) → verifica firma → INSERT + cola  │
│  Edge Fn "agent-runner"                                     │
│    lee cola → debounce → arma contexto → Claude (tools)     │
│    → ejecuta tools → envía respuesta → actualiza caso       │
└──────────────┬──────────────────────────────────────────────┘
               │
        ┌──────▼──────┐     ┌─────────────────┐
        │ Anthropic   │     │ Google Places   │
        │ Claude API  │     │ API (New)       │
        └─────────────┘     └─────────────────┘
```

### 10.4 Procesamiento de mensajes entrantes (detalle)

1. El webhook guarda el mensaje en `messages` (unique `wamid`) y encola `{conversation_id}` en `pgmq` con un *visibility delay* de unos 4 s (debounce).
2. El worker toma el trabajo y lanza un **lock por conversación** (`pg_advisory_xact_lock(hash(conversation_id))`) para que no haya dos ejecuciones en paralelo en la misma conversación.
3. Si llegaron mensajes nuevos durante el debounce, se agrupan en un solo turno.
4. Se ejecuta el agente, se envía la respuesta y se registra el `agent_run` (tokens, latencia, herramientas usadas, errores).
5. Si falla, se reintenta con backoff (máximo 3 veces). Después va a la *dead letter* y el caso pasa a `requiere_atencion`.

### 10.5 Estructura del repositorio (propuesta)

```
teo/
├── FICHA_TECNICA.md          ← este documento
├── CLAUDE.md                 ← guía para agentes de código
├── TEO_Brand_Kit_v1.0/       ← kit de marca (no tocar)
├── design-system/teo/        ← MASTER.md + tokens (ui-ux-pro-max)
├── .ref/                     ← repos context-gpt clonados (solo lectura, en .gitignore)
├── web/                      ← Next.js 16 (panel)
│   ├── app/(marketing)/        ← landing pública: /, /precios, /privacidad, /terminos, /contacto
│   ├── app/(auth)/             ← /login, /registro, /recuperar, /auth/callback
│   ├── app/onboarding/         ← asistente de alta del comercio
│   ├── app/app/[org]/          ← panel del comercio: casos, clientes, catalogo, tiendas, metricas, config
│   ├── app/admin/              ← panel superadmin (solo equipo Teo)
│   ├── components/ (ui/ = shadcn)
│   ├── lib/ (supabase, places, validations)
│   └── tests/ e2e/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── _shared/ (whatsapp/, llm/, agent/, cases/, pipeline/, logger.ts)
│   │   ├── webhook/          ← recibe de Meta (verify + idempotencia + cola)
│   │   ├── agent-runner/     ← consume la cola, corre el agente
│   │   └── send/             ← envíos desde el panel
│   └── seed.sql
└── evals/                    ← conversaciones de prueba del agente
```

---

## 11. Modelo de datos (borrador)

Todas las tablas de negocio llevan `org_id` y **RLS**: un usuario solo ve las organizaciones de las que es miembro. Usan `id uuid`, `created_at` y `updated_at`.

**Organización y usuarios**
- `organizations`: name, slug, rubro, plan, timezone (por defecto `America/Guayaquil`), currency (por defecto `USD`), status.
- `memberships`: org_id, user_id, role (`owner|admin|operador`).
- `platform_admins`: user_id, role (`superadmin|soporte`), created_by. Está **fuera** de las organizaciones. La función SQL `is_platform_admin()` se usa en las políticas RLS de lectura global.
- `admin_audit_log`: admin_id, acción, org_id, target, metadata y fecha. Registra toda acción de un superadmin, incluida la impersonación.
- `invitations`

**Contexto del comercio**
- `business_profiles`: org_id, descripción, tono, políticas (jsonb), FAQs, google_place_id.
- `stores`: org_id, nombre, dirección, lat/lng, horarios (jsonb), teléfono, google_place_id, cobertura de envío.
- `product_categories`
- `products`: org_id, category_id, nombre, descripción, precio, moneda, sku, activo, stock (nullable), atributos (jsonb), `search_tsv`, `embedding vector`.
- `product_variants`: product_id, nombre, precio, stock.
- `product_media`: product_id, storage_path, orden.
- `payment_methods`: org_id, tipo (`transferencia|efectivo|link`), detalles (jsonb), activo.
- `knowledge_docs` y `knowledge_chunks` (con embedding).
- `agent_settings`: org_id, modo, nombre visible, saludo, horario, reglas de escalamiento, umbral de monto, tiempo de expiración.

**WhatsApp**
- `whatsapp_accounts`: org_id, waba_id, phone_number_id (unique), número, nombre visible, vault_secret_id (token), estado, quality_rating.

**Clientes y casos**
- `contacts`: org_id, wa_id (teléfono), nombre, email, dirección, etiquetas[], notas, resumen_ia, opt_in_marketing. Unique `(org_id, wa_id)`.
- `conversations`: org_id, contact_id, whatsapp_account_id, last_inbound_at (ventana de 24 h), handled_by (`teo|humano`).
- `cases`: org_id, contact_id, conversation_id, tipo (`venta|consulta|postventa|reclamo`), status (enum `case_status`), previous_status, assignee_id, prioridad, monto_estimado, opened_at, closed_at, close_reason. Índice parcial unique: un solo caso abierto por contacto.
- `case_events`: case_id, actor (`teo|user:<id>|sistema`), from_status, to_status, motivo, metadata.
- `messages`: org_id, conversation_id, case_id, direction (`in|out`), author (`cliente|teo|user:<id>`), type, body, media_path, wamid (unique), status (`sent|delivered|read|failed`), payload_raw.
- `ai_suggestions`: case_id, message_id, texto, acciones (jsonb), estado (`usada|editada|descartada`).

**Pedidos y pagos**
- `orders`: org_id, case_id, contact_id, estado (`borrador|confirmado|pagado|cancelado`), subtotal, envío, total, entrega (jsonb), store_id.
- `order_items`: order_id, product_id, variant_id, cantidad, precio_unitario (precio congelado), subtotal.
- `payments`: order_id, método, monto_declarado, comprobante_path, extraccion_ia (jsonb), estado (`pendiente|confirmado|rechazado`), confirmado_por, confirmado_at.

**Operación de IA**
- `agent_runs`: org_id, case_id, modelo, input_tokens, output_tokens, cache_read_tokens, latencia_ms, tools (jsonb), stop_reason, error.

**Integraciones (estructura para la Fase 2)**
- `integrations`: org_id, tipo (`google_places|crm_x`), config, estado, last_sync_at.

---

## 12. Dashboard: módulos y UX

### 12.1 Navegación (sidebar azul Teo, como en el manual)

1. **Casos** (inicio): Kanban, con vista alternativa de lista.
2. **Conversaciones**: bandeja tipo chat.
3. **Clientes**: lista y ficha.
4. **Catálogo**: productos, categorías e importación.
5. **Tiendas**
6. **Métricas**
7. **Configuración**: negocio, Teo, pagos, WhatsApp, equipo, conexiones y plan.

### 12.2 Pantalla de caso (la más importante)

```
┌──────────────┬─────────────────────────────────┬──────────────────────┐
│ Lista/Kanban │  Chat (burbujas estilo WA)       │ Panel del cliente    │
│ filtros      │  - mensajes cliente / Teo / op.  │ - datos, etiquetas   │
│              │  - eventos de estado inline      │ - pedido actual      │
│              │  ─────────────────────────────── │   (ítems, total)     │
│              │  Sugerencias de Teo (chips lila) │ - comprobante + datos│
│              │  [ caja de respuesta ] [Enviar]  │   extraídos          │
│              │  Toggle: Teo ⟷ Humano            │ - [Confirmar pago]   │
│              │                                  │ - historial de casos │
└──────────────┴─────────────────────────────────┴──────────────────────┘
```

- En móvil, las tres columnas pasan a pestañas.
- Atajos de teclado: `J`/`K` para navegar, `R` para responder, `1`–`3` para usar una sugerencia y `E` para escalar o devolver a Teo.
- Indicadores: ventana de 24 h, quién maneja el caso (Teo o humano), tiempo sin respuesta y ticks de WhatsApp.

### 12.3 Kanban

- Tarjeta: nombre o teléfono, último mensaje, monto, tiempo en la columna, avatar del asignado e icono de Teo o humano.
- Drag & drop con validación de transición (si no es válida, la tarjeta vuelve a su lugar y aparece un toast explicando por qué).
- Filtros: tienda, asignado, tipo, etiqueta, fecha, "solo míos" y "requiere atención".
- Contadores y suma de montos por columna.

### 12.0 Una sola aplicación, tres superficies

Todo vive en **una sola app Next.js** con **un solo login** (Supabase Auth). Después de iniciar sesión, la app redirige según el perfil del usuario:

| Superficie | Ruta | Quién entra | Protección |
|---|---|---|---|
| Landing pública | `/`, `/precios`, `/privacidad`, `/terminos`, `/contacto` | Cualquiera | Pública. Botones **"Crear cuenta"** y **"Iniciar sesión"** en el header y en el CTA principal |
| Panel del comercio | `/onboarding`, `/app/[org]/…` | Miembros del comercio (owner, admin, operador) | `proxy.ts` (sesión) + RLS por membresía + chequeo en cada Server Action |
| Panel superadmin | `/admin/…` | Usuarios en `platform_admins` | `proxy.ts` + verificación en el servidor de `is_platform_admin()` en cada página y acción |

Flujo: **Landing → Crear cuenta → Onboarding (negocio, catálogo, pagos, Teo, WhatsApp) → Panel del comercio con Teo activo.**
- Si un usuario pertenece a varios comercios, elige uno al entrar. La ruta lleva el `[org]`, que se valida contra la membresía.
- Un superadmin ve en el header el acceso "Admin" y puede abrir cualquier comercio en **modo impersonación**, con un banner visible y registro en `admin_audit_log`.
- El primer superadmin se crea con un script o seed (nunca desde la UI). Los siguientes los invita un superadmin.

### 12.4 Design system con UI UX Pro Max

Skill: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

**Instalación (en la raíz del proyecto):**
```bash
npx ui-ux-pro-max-cli init --ai claude        # instala en .claude/skills/ui-ux-pro-max/
# requiere python3
```

**Generar el design system persistente:**
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "SaaS CRM dashboard whatsapp sales conversational AI" \
  --design-system --persist -p "Teo" --output-dir "." --tokens css
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "kanban dashboard dense data" --design-system --persist -p "Teo" --page "casos" --output-dir "."
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "landing conversion" \
  --design-system --persist -p "Teo" --page "landing" --output-dir "."
```

Esto genera `design-system/teo/MASTER.md`, `tokens.css` y `pages/*.md`.

**Regla de precedencia:** **manual de marca Teo > MASTER.md > recomendaciones de la skill.** Después de generar el MASTER.md se reemplazan su paleta y su tipografía por las de la sección 2, y se usa la skill para lo que el manual no define: estilo, espaciado, radios, sombras, densidad, patrones UX, accesibilidad y gráficos.

**Checklist previa a entregar cualquier pantalla** (de la skill): sin emojis como iconos, `cursor-pointer` en los clicables, contraste ≥ 4.5:1, foco visible, `prefers-reduced-motion` respetado, y responsive en 375, 768, 1024 y 1440 px.

---

### 12.5 Panel superadmin (`/admin`)

| Módulo | Qué muestra o permite |
|---|---|
| **Comercios** | Lista con buscador: plan, estado (onboarding / activo / suspendido), WhatsApp conectado, calidad del número, fecha de alta y último mensaje. Ficha de detalle por comercio |
| **Onboarding** | Embudo de altas: cuántos comercios están en cada paso y dónde abandonan |
| **Uso y costos** | Mensajes, casos y ventas por comercio; tokens y costo de IA (desde `agent_runs`); topes diarios por comercio |
| **Salud** | Errores del webhook y del agente, cola pendiente, tasa de escalamiento y latencia p95 |
| **Acciones** | Suspender o reactivar un comercio, pausar o activar a Teo, cambiar el plan, reenviar una invitación, desconectar WhatsApp |
| **Impersonación** | "Ver como" un comercio: solo lectura por defecto y escritura con confirmación extra. Todo queda auditado |
| **Equipo Teo** | Alta y baja de superadmins y usuarios de soporte |
| **Auditoría** | `admin_audit_log`, con filtros |

En la Fase 1 este panel es simple (tablas y KPIs). Facturación y planes llegan cuando se resuelva D-10.

## 13. Seguridad, privacidad y cumplimiento

- **Aislamiento multi-tenant:** RLS en todas las tablas y tests automáticos de RLS ("un usuario de la org A no ve nada de la org B"). La `service_role` solo se usa en el worker y el webhook, y siempre filtrando por `org_id`.
- **Secretos:** tokens de WhatsApp en Vault. Las API keys (Anthropic, Google, Meta App Secret) van en variables de entorno de Vercel y Supabase, nunca en el repositorio. Se mantiene un `.env.example` solo con los nombres.
- **Ecuador, LOPDP** (Ley Orgánica de Protección de Datos Personales): Teo actúa como **encargado** del tratamiento y el comercio como **responsable**. Se necesita: contrato de encargo (en los términos de servicio), política de privacidad, derechos ARCO (exportar y eliminar un contacto), registro de actividades y retención configurable de mensajes y comprobantes.
- **Políticas de Meta:** las de WhatsApp Business (opt-in para mensajes iniciados por el negocio y prohibición de vender productos restringidos) y la política de IA de Meta para chatbots de propósito específico.
- **Comprobantes de pago:** bucket privado, URLs firmadas de corta duración y acceso solo de su organización.
- **Prompt injection:** el contenido del cliente es dato, no instrucción. Las herramientas validan permisos en el servidor, y el agente no puede leer datos de otros contactos.
- **Auditoría:** `case_events`, logs de acceso del superadmin y registro de quién confirmó cada pago.

---

## 14. Calidad: testing y evals

- **Unit (Vitest):** transiciones de estado, cálculo de totales, parseo del webhook y validación de firma.
- **Integración:** webhook → cola → worker con Meta y Claude simulados.
- **RLS:** una suite SQL o TS que intenta leer y escribir datos de otra organización.
- **E2E (Playwright):** onboarding, simulador de chat, Kanban y confirmación de pago.
- **Evals del agente** (`evals/`): entre 30 y 50 conversaciones "doradas" por rubro (ropa, comida, tecnología, servicios) que verifican:
  - que no invente precios ni productos;
  - que llegue a `esperando_pago` en el camino feliz;
  - que escale cuando corresponde;
  - el tono y el largo de los mensajes;
  - que resista la prompt injection.
  Se corren en CI ante cada cambio del prompt o de las herramientas.
- **Simulador interno:** un chat en el panel que habla con el agente sin pasar por WhatsApp. Lo usan QA y los comercios.

---

## 15. Observabilidad y operación

- Sentry (front y back), logs estructurados con `org_id`, `case_id` y `run_id`.
- `agent_runs` como fuente para un panel interno: latencia p50 y p95, costo por organización, tasa de escalamiento, tasa de errores y cache hit.
- Alertas: webhook con errores, cola con backlog > N, tasa de fallos de Meta, `quality_rating` del número en baja.
- Runbooks: número bloqueado o degradado, token expirado y caída de la API de Claude (fallback: pasar los casos a humano y avisar al comercio).

---

## 16. Métricas de producto (KPIs)

| KPI | Definición | Meta inicial (a validar) |
|---|---|---|
| Conversión | casos de venta que llegan a `confirmado` / casos de venta | > 25 % |
| Llegada a pago | casos que llegan a `esperando_pago` / casos de venta | > 40 % |
| Autonomía de Teo | casos cerrados sin intervención humana / casos cerrados | > 60 % |
| Primera respuesta | tiempo hasta el primer mensaje de Teo | p95 < 15 s |
| Uso de sugerencias | sugerencias usadas o editadas / mostradas | > 50 % |
| Tiempo de confirmación de pago | `pago_por_confirmar` → `confirmado` | < 2 h |
| Activación | comercios con número conectado y ≥ 1 venta en 7 días | — |

---

## 17. Costos estimados (a validar antes de definir precios)

- **Meta:** las conversaciones iniciadas por el cliente (servicio) se responden **sin costo** dentro de la ventana de 24 h, y las plantillas `utility` dentro de esa ventana también son gratis. Las plantillas fuera de la ventana se cobran por mensaje según el país. Hay que confirmarlo en la tabla oficial: https://developers.facebook.com/docs/whatsapp/pricing
- **Claude (precios de lista, noviembre de 2026, por millón de tokens):** Opus 5.5 cuesta $4 de entrada y $20 de salida; Haiku 5.5 cuesta $0,10 y $0,50. Con prompt caching del contexto del comercio, el costo por conversación debería ser de unos centavos. **Hay que medirlo con `agent_runs` en el piloto** antes de fijar el precio del plan.
- **Infraestructura:** Supabase Pro (~$25/mes) + Vercel Pro (~$20/mes por usuario) + Google Places (cobro por request, con crédito mensual) + Resend + Sentry (planes gratuitos al inicio).

---

### 17.1 Planes para los comercios (propuesta v1)

Se toma como base el esquema de context-gpt (Starter a $29 con 500 mensajes al día, Pro a $49 ilimitado, 14 días de prueba) y se reorganiza en **4 escalones por volumen de mensajes**, con un plan gancho que concentra las ventas.

**Unidad de cobro:** **mensajes respondidos por Teo al mes** (respuestas generadas por la IA). Los mensajes que escribe el operador a mano y los que envía el cliente **no cuentan**. Es fácil de entender para el comercio y está alineado con nuestro costo real (IA).

| | **Gratis** | **Emprende** | **Negocio** ⭐ *(gancho)* | **Pro** |
|---|---|---|---|---|
| Precio/mes | $0 | $19 | **$39** | $99 |
| Mensajes de Teo/mes | 100 | 1.000 | **3.000** | 10.000 |
| Costo por mensaje | — | $0,019 | **$0,013** | $0,0099 |
| Usuarios del panel | 1 | 2 | 5 | Ilimitados |
| Tiendas | 1 | 1 | 3 | Ilimitadas |
| Productos en catálogo | 30 | 200 | 1.000 | Ilimitados |
| Kanban, chat en vivo y sugerencias de IA | ✓ | ✓ | ✓ | ✓ |
| Modo copiloto y paso a humano | ✓ | ✓ | ✓ | ✓ |
| Importar catálogo (CSV/Excel) y Google Places | — | ✓ | ✓ | ✓ |
| Lectura de comprobantes con IA | — | — | ✓ | ✓ |
| Métricas | Básicas | Básicas | Completas | Avanzadas + exportación |
| Sello "Atendido por Teo" en el saludo | Sí | No | No | No |
| Campañas y plantillas (Fase 2) | — | — | 1.000 envíos/mes | Ilimitadas* |
| Integraciones CRM/API y webhooks (Fase 2) | — | — | — | ✓ |
| Varios números de WhatsApp (Fase 2) | — | — | — | ✓ |
| Soporte | Comunidad | Email | Prioritario | Dedicado + onboarding asistido |

\* Las plantillas de Meta iniciadas por el negocio se trasladan al costo de Meta.

**Por qué Negocio es el gancho:** cuesta el doble que Emprende pero da el **triple de mensajes** y desbloquea lo que más valora un comercio que vende (lectura de comprobantes, 5 usuarios y varias tiendas). Emprende funciona como plan "señuelo" que hace ver a Negocio como la mejor compra. Pro ($99) es el **ancla alta**: hace que $39 parezca razonable y captura a los comercios grandes con funciones avanzadas.

**Reglas:**
- **Prueba gratis:** 14 días del plan Negocio al registrarse (como en context-gpt). Al terminar, si el comercio no elige un plan, pasa a Gratis.
- **Al agotar los mensajes, nunca se corta el WhatsApp:** Teo pasa a **modo copiloto** (solo sugiere y el operador envía) y el panel ofrece subir de plan o comprar un **paquete extra** (p. ej. 500 mensajes por $9).
- Avisos al 80 % y al 100 % del consumo, en el panel y por email.
- **Anual:** 2 meses gratis (pagas 10 y recibes 12).
- **Precios en USD** (moneda de Ecuador). Los cupos se reinician cada mes de facturación.

**A validar en el piloto:** el **costo real de IA por mensaje** (desde `agent_runs`). La meta es que la IA no supere el **20 %** del ingreso de cada plan. Si se supera, se ajustan los cupos, el modelo o el effort antes del lanzamiento público.

**Modelo de datos:** `plans` (límites en jsonb: mensajes, usuarios, tiendas, productos, features[]), `subscriptions` (org_id, plan_id, estado `trial|active|past_due|canceled`, período, proveedor de pago) y `usage_counters` (org_id, período, mensajes_teo, extras). El límite se chequea en el agent-runner **antes** de llamar al LLM.

## 18. Decisiones

### Tomadas (propuestas en esta versión; confirmar)

| ID | Decisión |
|---|---|
| D-00 | ✅ country-gpt (`context-gpt/supabase` y `context-gpt/dashboard`) es solo **referencia** de manejo de contexto y conexión con WhatsApp (sección 10.1). No se copia código |
| D-01 | Stack: Next.js 16 (panel en Vercel) + Supabase (Edge Functions Deno/Hono para webhook y agente) + Claude |
| D-04 | ✅ El webhook y el worker del agente van en **Supabase Edge Functions**, el mismo patrón probado en context-gpt |
| D-16 | ✅ **Repo nuevo `teo`, todo de cero.** country-gpt solo como base de referencia |
| D-17 | ✅ **Teo es independiente** de los demás proyectos y organizaciones: tiene su propia organización de GitHub, sus propias cuentas de Vercel, Supabase, Meta y Anthropic, y su propio dominio. No comparte infraestructura ni credenciales con context-gpt, Rutea ni peiGo. GitHub: organización **`teo-wapp-org`**. Dominio provisional: **teo-wapp** (TLD a confirmar) |
| D-03 | ✅ **Tech Provider + Embedded Signup**: el comercio se conecta solo y usa Teo apenas termina el onboarding. Trámite con Meta desde la semana 1; BSP con Embedded Signup como contingencia si en la semana 5 no hay aprobación. Ver la sección 8.1 |
| D-02 | WhatsApp solo por la Cloud API oficial de Meta, sin números no oficiales |
| D-09 | Precedencia de diseño: manual Teo > MASTER.md > UI UX Pro Max |
| D-11 | Un caso abierto por contacto; una compra nueva abre un caso nuevo |
| D-12 | El LLM nunca calcula precios ni totales: lo hace el backend |
| D-13 | La confirmación de pago es manual en la Fase 1 |

### Abiertas (necesitan respuesta)

| ID | Pregunta | Recomendación |
|---|---|---|
| D-05 | ¿Modelo del agente: Opus 5.5 (effort bajo) o Sonnet 5.5? ¿Messages API + Tool Runner o Managed Agents de Anthropic? | Medir la latencia y el costo con evals en la semana 3. Messages API + Tool Runner porque el estado vive en nuestra base de datos y la latencia de WhatsApp es crítica |
| D-06 | ¿Proveedor de embeddings para el catálogo? | Empezar con búsqueda por texto (`pg_trgm` + `tsvector`) y agregar embeddings (Voyage u OpenAI) solo si las evals lo justifican |
| D-07 | ¿Transcribir notas de voz en la Fase 1? | Sí si el piloto lo pide: en Ecuador el audio es muy común |
| D-08 | ¿Qué datos de Google Places se pueden persistir? | Revisión legal; tratarlos como sugerencia que el comercio confirma |
| D-10 | Modelo de negocio: **✅ 4 planes por mensajes de Teo** (sección 17.1, precios por validar). Pendiente: ¿qué pasarela usamos para cobrar a los comercios (Stripe no opera directo en Ecuador; alternativas: Paddle, Lemon Squeezy, Payphone, Kushki, Datafast)? | Merchant of Record (Paddle o Lemon Squeezy) para no lidiar con impuestos internacionales; revisar Payphone/Kushki para tarjetas locales |
| D-14 | ¿Comercios piloto? ¿Rubros? | 3–5 comercios de rubros distintos |
| D-15 | ¿Relación con peiGo (pagos con la billetera como método de cobro en la Fase 2)? | Explorar: sería un diferenciador fuerte para automatizar la confirmación |

---

## 19. Plan de trabajo

Duración estimada del MVP: **~10 semanas** con 1–2 desarrolladores full-stack y apoyo de diseño. Cada fase termina con una demo.

### Prerrequisitos legales y de Meta (camino crítico)

Estado al 20/11/2026: **la empresa Teo todavía no está constituida**, no hay una cuenta de Meta Business Manager a su nombre ni dominio o sitio web.

La verificación del negocio en Meta, obligatoria para ser Tech Provider, pide documentos legales de la empresa: razón social, dirección, teléfono y RUC o escritura. **Sin empresa constituida no se puede completar el Tech Provider.** Ese es el camino crítico del proyecto.

| # | Paso | Depende de | Responsable |
|---|---|---|---|
| L1 | Constituir la empresa (p. ej. **S.A.S.** en la Superintendencia de Compañías) y obtener el **RUC** en el SRI | — | Fundadores + abogado/contador |
| L2 | Comprar el **dominio** de Teo y crear el email del dominio (p. ej. `hola@<dominio>`) | — | Fundadores |
| L3 | Publicar la **landing en Vercel** con `/privacidad` y `/terminos` (LOPDP) | L2 (puede arrancar en `*.vercel.app`) | Desarrollo |
| L4 | Crear el **Meta Business Manager** de Teo y verificar el dominio | L2, L3 | Fundadores |
| L5 | Crear la **app en Meta for Developers** (WhatsApp) en modo desarrollo, con número de prueba | L4 | Desarrollo |
| L6 | **Verificación del negocio** en Meta | L1, L4 | Fundadores |
| L7 | App Review (permisos de WhatsApp Business), configuración de Embedded Signup y alta como **Tech Provider** | L5, L6 | Desarrollo + fundadores |

**Lo que no depende de la empresa:** todo el desarrollo. El simulador, el agente, el panel y el webhook se prueban con el **número de prueba** de Meta en modo desarrollo (L5), que no exige verificación del negocio. Así, la constitución de la empresa corre en paralelo con el código.

**Si la empresa se demora:** el piloto se puede iniciar con un BSP que ya tenga Embedded Signup. Hay que confirmar los requisitos de alta de partner de cada BSP, porque también pueden pedir datos de la empresa.

### Fase 0: Fundaciones (semana 1)

| # | Tarea | Entregable |
|---|---|---|
| 0.1 | ✅ Revisar el código de context-gpt (D-00) | Sección 10.1 |
| 0.1b | Escribir desde cero `supabase/functions/_shared/` (whatsapp, llm, logger) siguiendo los patrones de la sección 10.1, con tests | Tests en verde con `deno test` (con chequeo de tipos) |
| 0.2 | Arrancar L1–L5 (empresa, dominio, landing, Business Manager, app de Meta con número de prueba) | Número de prueba funcionando en la Cloud API |
| 0.2b | Landing en Vercel: marca Teo, propuesta de valor, `/privacidad`, `/terminos`, contacto | URL pública para Meta |
| 0.3 | Repo git, Next.js, Supabase (proyecto `teo-dev`), Vercel, CI (lint, tests), `.env.example` | App vacía desplegada |
| 0.4 | Instalar UI UX Pro Max y generar `design-system/teo/MASTER.md` ajustado a la marca | Tokens, tema claro y oscuro, componentes base de shadcn |
| 0.5 | Migración inicial: orgs, memberships, RLS y tests de RLS | Auth + creación de organización |
| 0.6 | `CLAUDE.md` del repo con las convenciones | — |

### Fase 1: Contexto del comercio (semanas 2–3)

- Onboarding con checklist; perfil del negocio y tiendas.
- Integración con Google Places (búsqueda, importación y confirmación).
- Catálogo: CRUD, fotos, variantes e importación CSV/Excel.
- Métodos de pago, políticas, FAQs y configuración de Teo.
- **Demo:** un comercio completo cargado en menos de 30 minutos.

### Fase 2: Agente en el simulador (semanas 3–5)

- Prompt, herramientas, cálculo de pedidos en el backend y máquina de estados.
- Simulador de chat en el panel.
- Set de evals (30+ conversaciones) en CI; elección de modelo y effort (D-05).
- **Demo:** Teo vende en el simulador hasta `esperando_pago` sin inventar nada.

### Fase 3: WhatsApp real (semanas 5–6)

- Webhook (firma, idempotencia, statuses), cola `pgmq`, worker con debounce y lock.
- Envío de texto, media e interactivos; descarga de media a Storage.
- Embedded Signup en el panel (o conexión manual si el Tech Provider está pendiente).
- **Demo:** conversación real por WhatsApp de punta a punta.

### Fase 4: Panel operativo (semanas 6–8)

- Kanban, pantalla de caso, chat en vivo con Realtime.
- Respuestas sugeridas, toggle Teo/humano, asignación y notificaciones.
- Comprobantes con extracción por IA, confirmación de pago y cierre.
- Ficha del cliente e historial.
- **Demo:** un operador gestiona 20 casos simultáneos.

### Fase 5: Endurecimiento y piloto (semanas 9–10)

- Métricas básicas y panel interno de `agent_runs`.
- Sentry, alertas y runbooks; pruebas de carga del webhook.
- Términos de servicio, política de privacidad y LOPDP; exportar y eliminar un contacto.
- Onboarding de 3–5 comercios piloto (D-14), primero en modo **copiloto** y después en piloto automático.
- **Salida:** KPIs de la sección 16 medidos con datos reales.

### Riesgos principales

| Riesgo | Mitigación |
|---|---|
| La empresa no está constituida, lo que bloquea la verificación de Meta y el Tech Provider | Constituirla ya (L1); desarrollar con el número de prueba; BSP como plan B |
| El trámite de Meta (Tech Provider o verificación) demora | Empezarlo apenas exista la empresa; tener un BSP como plan B |
| Teo inventa información o vende mal | Guardrails, precios en el backend, evals en CI y modo copiloto al inicio |
| Latencia alta en WhatsApp | Debounce corto, caching, effort bajo, medir p95 |
| Bloqueo o mala calidad del número del comercio | Nunca iniciar conversaciones sin opt-in, monitorear `quality_rating` |
| Fuga de datos entre comercios | RLS + tests de RLS + revisión de seguridad antes del piloto |
| Comercios con catálogos desordenados | Importador tolerante y Teo que escala cuando no encuentra algo |

---

## 20. Registro de cambios

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-11-20 | 0.1 | Primera versión: ficha técnica completa, decisiones iniciales y plan de 10 semanas. Se detecta que la carpeta local de country-gpt está vacía. |
| 2026-11-20 | 0.2 | Se analizan `context-gpt/supabase` y `context-gpt/dashboard`. Sección 10.1 reescrita (qué copiar, adaptar y descartar, y errores a no repetir). Stack: Next 16 y Edge Functions Deno/Hono para webhook y agente (D-04 cerrada). Nueva decisión D-16. Alerta de secretos expuestos en context-gpt. |
| 2026-11-20 | 0.3 | Aclaración del usuario: Teo se construye **de cero**; country-gpt es solo referencia de manejo de contexto y de WhatsApp. Se cierra D-16 (repo nuevo) y la sección 10.1 pasa de "copiar" a "patrones a reimplementar". |
| 2026-11-20 | 0.4 | D-03 cerrada: Tech Provider + Embedded Signup para que el comercio use Teo apenas termina el onboarding. Se descarta el alta manual; BSP como contingencia. |
| 2026-11-20 | 0.5 | Se agregan los prerrequisitos legales y de Meta (L1–L7): la empresa no está constituida y eso bloquea el Tech Provider. El desarrollo sigue con el número de prueba. Nueva tarea 0.2b: landing en Vercel. |
| 2026-11-20 | 0.6 | Una sola app con tres superficies: landing pública con registro y login, panel del comercio y panel superadmin `/admin` para administrar todos los comercios. Nuevas tablas `platform_admins` y `admin_audit_log`. Secciones 12.0 y 12.5. |
| 2026-11-20 | 0.7 | D-17: Teo es independiente, con organización de GitHub y cuentas propias. |
| 2026-11-20 | 0.8 | Sección 17.1: 4 planes (Gratis, Emprende $19, Negocio $39 ⭐ como gancho, Pro $99) cobrados por mensajes de Teo, con base en los precios de context-gpt. D-10 parcialmente cerrada (falta la pasarela). Organización de GitHub `teo-wapp-org`. |
