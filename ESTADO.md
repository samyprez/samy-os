# Estado de Samy OS

> **Para qué sirve este archivo.** Es el resumen de contexto del proyecto. Súbelo
> al Proyecto de Claude (o pásalo al inicio de un chat nuevo) para que el
> asistente sepa dónde vamos sin tener que reconstruirlo desde los commits.
> Cuando cambie algo importante, actualízalo — es la memoria del proyecto.

**Última actualización:** 20 de agosto de 2026 — verificado en vivo contra producción
**Repo:** https://github.com/samyprez/samy-os
**Producción:** https://samy-os-seven.vercel.app (Vercel, deploy automático desde `main`)

---

## Qué es Samy OS

El backend operativo y el dashboard de **Walie**, el asistente de Samuel.
La superficie principal de conversación es **ChatGPT** (vía GPT Action); el
dashboard web es para revisión visual y control manual.

```
ChatGPT / voz  →  API segura de Samy OS  →  Supabase + Hub + Google  →  dashboard
```

Todo pasa por un solo cerebro: `lib/server/gateway-operations.ts`
(`runGatewayOperation`). Tres puertas distintas entran ahí:

| Puerta | Ruta | Autenticación |
|---|---|---|
| ChatGPT | `POST /api/chatgpt` | Bearer `ASSISTANT_API_KEY` |
| Dashboard y voz en el navegador | `POST /api/dashboard` | Token de sesión Supabase del usuario |
| Enviar correo (aparte, a propósito) | `POST /api/chatgpt/send-email` y `/api/dashboard/send-email` | igual que arriba |
| Avisos por WhatsApp (cualquier automatización) | `POST /api/notifications/whatsapp` | Bearer `NOTIFICATION_API_KEY` |

Enviar correo vive en su propia ruta porque ChatGPT marca la confirmación
**por operación**, no por campo: el gateway principal es
`x-openai-isConsequential: false` (para que la voz funcione sin preguntar cada
vez) y enviar correo es `true` (siempre confirma).

---

## Dónde vive cada dato (esto cambió el 10–11 de agosto)

| Dato | Vive en | Módulo |
|---|---|---|
| **Tareas** (`list_tasks`, `create_task`, `complete_task`) | **Amazing Business Hub** — son *proyectos* del Hub | `lib/server/hub.ts` |
| **Proyectos, clientes, facturas** | **Amazing Business Hub** | `lib/server/hub.ts` |
| **Notas** (`list_notes`, `create_note`) | **Hub**, en el tablero de recordatorios | `lib/server/hub.ts` |
| **Eventos** (`list_events`, `create_event`, `delete_event`) | **Google Calendar real** (calendario `primary`) | `lib/server/calendar.ts` |
| **Correo** (`search_email`, `read_email`, enviar) | **Gmail API** | `lib/server/gmail.ts` |
| **Salud** (`list_health`, `create_health`) | Supabase de Samy OS, tabla `health_entries` | gateway |
| **Marcas** (`list_brands`, `create_brand`) | Supabase de Samy OS | gateway |
| **WhatsApp entrante / conversaciones** (empezado, no terminado) | WhatsApp Business Cloud API | `lib/server/whatsapp.ts` |
| **Avisos salientes por WhatsApp** (listo) | Twilio WhatsApp | `lib/server/notifications.ts` + `lib/server/twilio-whatsapp.ts` — ver `docs/whatsapp-gateway.md` |
| **Conector MCP para ChatGPT** (listo) | OAuth propio, sin estado | `app/api/mcp/` + `lib/server/mcp-oauth.ts`. Es lo que usan las tareas programadas: corren en chat normal, donde no hay Actions de GPT pero sí conectores. |

**Las tablas propias de Samy OS para tareas, clientes, notas y eventos quedaron
retiradas.** Los nombres de operación (`create_task`, etc.) se conservaron
porque son el vocabulario que ChatGPT ya conocía, pero por dentro son alias
sobre el Hub.

Nota importante sobre el Hub: su esquema se leyó de la base de datos en vivo,
**no** de las migraciones del repo, porque esas ya no coinciden.
`projects.status` es `pending|in_progress|monthly|urgent|completed`, y los
clientes usan `company_name`, no `name`.

---

## Integraciones

### Google (Gmail + Calendar) — una sola cuenta OAuth
Google emite **un** refresh token por (cliente, conjunto de scopes), así que
Calendar no necesitó una segunda app: solo se amplió el scope que Samuel
autoriza. Los dos módulos comparten `getAccessToken()` de `gmail.ts`.

Scopes: `gmail.readonly`, `gmail.send`, `calendar`.

**Trampa conocida:** si la app de Google Cloud sigue en modo **Testing**, el
refresh token **caduca a los 7 días**. Si `/api/health` reporta
`gmail.works: false` con `invalid_grant`, hay que volver a generar el token
abriendo:
`https://samy-os-seven.vercel.app/api/google/auth?token=<ASSISTANT_API_KEY>`
y copiando el valor que imprime el callback (Google no lo vuelve a mostrar).
Publicar la app quita esa caducidad.

Si Calendar da error de *insufficient scope*, es que el refresh token es
anterior al consentimiento de Calendar → volver a generarlo.

### ChatGPT (GPT Action)
El OpenAPI se genera de una sola fuente: `lib/server/openapi-schema.ts`, servido
en `/openapi.json` y `/api/chatgpt/openapi`.

**Nunca crear `public/openapi.json`** — un archivo ahí tapa la ruta y las dos
copias se separan; ese fue exactamente el bug que apuntó ChatGPT al endpoint
equivocado.

**Después de agregar una operación hay que re-importar el esquema en el editor
del GPT** (Configurar → Acciones → engranaje → Importar desde URL). Si no,
ChatGPT sigue con el contrato viejo y dice, con razón, que no tiene esa acción.

### WhatsApp Business (a medias)
Coexistence activado: Samuel sigue usando la app de WhatsApp Business en el
teléfono y la API ve las mismas conversaciones. Dos límites de Meta mandan el
diseño: la ventana de 24 h (fuera de ella solo plantillas aprobadas) y los
webhooks que se reintentan, así que los handlers son idempotentes y responden
200 rápido. Webhook en `app/api/whatsapp/webhook/route.ts`.

---

## Variables de entorno en Vercel

```text
# Samy OS (Supabase propio)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SAMY_OS_OWNER_USER_ID        # preferido, o SAMY_OS_OWNER_EMAIL

# Amazing Business Hub (Supabase aparte)
HUB_SUPABASE_URL
HUB_SUPABASE_SERVICE_ROLE_KEY

# Asistente
OPENAI_API_KEY
OPENAI_MODEL
ASSISTANT_API_KEY            # el bearer del gateway (legacy: SAMY_OS_API_TOKEN)

# Google (Gmail + Calendar)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN

# WhatsApp
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` y `ASSISTANT_API_KEY` **nunca** van al navegador.

**Dónde está la service-role key:** Supabase ya no usa la palabra "service role"
en ningún lado. Está en **Settings → API Keys → "Secret keys"**, como un valor
`sb_secret_...`. La "Publishable key" (`sb_publishable_...`) de la misma página
es la pública y no sirve. Copiar con el ícono, no a mano — el id del proyecto
está al lado y es fácil agarrarlo por error.

**Verificación:** `GET /api/health` distingue *configurado* de *funciona de
verdad* — ejerce la service-role key y el refresh token con llamadas reales.
`chatgptGateway` tiene que ser `true`.

---

## ⛔ QUÉ NO BORRAR NUNCA — y por qué

**Esta es la respuesta a "¿qué pasa si borro esto?". Léela antes de tocar nada
en Vercel, Supabase o Google Cloud.**

### `samy-os` es lo que hace funcionar la voz de ChatGPT con el dashboard

La cadena completa, verificada el 20 de agosto de 2026:

```
Tú hablas en ChatGPT (el GPT "Samy OS")
        ↓  GPT Action, bearer ASSISTANT_API_KEY
samy-os-seven.vercel.app/api/chatgpt   ← EL PUENTE. Si esto muere, la voz muere.
        ↓  runGatewayOperation
Hub Supabase (uxkdqtfbtmcjhmdiryfq)  +  Google Calendar  +  Gmail
        ↓
dashboard.amazingsolutions.ca  (lo que ves)
```

El GPT vive en:
`https://chatgpt.com/g/g-6a760c8a76d88191a01182af12dfb233-samy-os`
y el botón verde **Walie → Hablar** del dashboard apunta exactamente ahí.

**Si borras el proyecto `samy-os` de Vercel, o su repo, o `ASSISTANT_API_KEY`:**
el dashboard sigue viéndose igual, pero ChatGPT deja de poder crear tareas,
notas, clientes y eventos. La voz queda muerta y no es obvio por qué. El
dashboard **no** te va a avisar.

Cosas que parecen basura y no lo son:
- **`samy-os-seven.vercel.app`** — el nombre suena a proyecto de prueba. No lo es.
- **Las tablas viejas de Supabase de Samy OS** (`clients`, `tasks`, `notes`,
  `events`) — ya no las usa el gateway, **pero la pantalla de
  `samy-os-seven.vercel.app/dashboard` todavía las lee**. Si las borras, esa
  pantalla se rompe. Primero hay que migrar esa UI a `/api/dashboard`.
  `brands` y `health_entries` **sí** están en uso activo.
- **`GOOGLE_REFRESH_TOKEN`** — es el mismo para Gmail y Calendar. Borrarlo
  tumba los dos a la vez.
- **`HUB_SUPABASE_SERVICE_ROLE_KEY`** — sin esto el gateway no puede tocar
  tareas, clientes, notas ni facturas. Es la mitad del sistema.

### Verificación rápida de que todo sigue vivo

`https://samy-os-seven.vercel.app/api/health` — todo tiene que decir `true`.
Estado al 20 de agosto de 2026: Supabase ✓, OpenAI ✓, gateway ✓,
Gmail ✓ (samyprez@gmail.com), Calendar ✓, Hub ✓.

---

## Mapa de las apps (hay TRES, no una)

| App | Dirección | Qué es | Código |
|---|---|---|---|
| **Samy OS** | `samy-os-seven.vercel.app` | El puente/gateway. Su dashboard propio está desactualizado. | `github.com/samyprez/samy-os` |
| **Amazing Business Hub** | `app.amazingsolutions.ca` | Sistema de registro: clientes, proyectos, facturas. Auth con Supabase. | `github.com/samyprez/amazing-business-hub` |
| **Dashboard nuevo** | `dashboard.amazingsolutions.ca` | El que usas todos los días. Auth con **Clerk**. Secciones: Dashboard, Notas, Calendario, Tareas, Growth OS, Clientes, Email Marketing, Facturas, Servicios, Link Payments, Suscripciones. | **⚠️ NO LOCALIZADO** |

**Ojo con esto:** `dashboard.amazingsolutions.ca` **no** es el repo
`amazing-business-hub`. Se comprobó el 20 de agosto: el repo local no tiene
`/dashboard/calendario`, `/dashboard/notas`, `/dashboard/overview` ni
`/dashboard/clients`, y usa autenticación de Supabase, mientras que el sitio en
vivo usa Clerk (`clerk.amazingsolutions.ca`) y es un "Next Shadcn Dashboard
Starter". **Falta encontrar dónde vive ese código** — anótalo aquí en cuanto se
sepa, porque sin eso no se puede arreglar nada de ese dashboard.

---

## Errores abiertos (verificados en vivo el 20 de agosto de 2026)

1. **Las horas del calendario salen en UTC, 4 horas adelantadas**, en
   `dashboard.amazingsolutions.ca/dashboard/calendario`. Comprobado contra la
   API de Google: "Excercise" es 6:00–7:00 AM y se muestra 10:00–11:00; el
   vuelo DM 5862 es 7:15–11:45 PM y se muestra 23:15–3:45. Además del display,
   esto va a agrupar mal por fecha los eventos de la noche. Falta forzar
   `America/Toronto` al renderizar.

2. **Prefetches de Next.js devolviendo 503** en el dashboard nuevo (las URLs
   `?_rsc=...` de casi todas las secciones). Las páginas cargan bien al hacer
   clic, así que no es urgente, pero está ahí.

3. **Nota propia de Samuel, "🔥 FIX THIS":** las alertas llegan al correo pero
   al hacer clic no llevan al dashboard.

4. **La pantalla de `samy-os-seven.vercel.app/dashboard` quedó desconectada.**
   Muestra Eventos 0 y 3 clientes de prueba porque lee las tablas retiradas.
   La ruta `/api/dashboard` ya existe con el cerebro correcto; falta migrar la
   UI a usarla.


## Copias de seguridad

- **Online:** GitHub `samyprez/samy-os`, rama `main`. Es la fuente de verdad.
- **PC:** `C:\Users\samyp\samy-os`
- Vercel despliega solo desde `main`, así que lo que está en GitHub es lo que
  está en producción.
