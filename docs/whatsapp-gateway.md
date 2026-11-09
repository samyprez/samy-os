# Gateway de notificaciones por WhatsApp

Una sola puerta para que cualquier automatización de Samuel mande un aviso a
WhatsApp. No es del canal de YouTube: el SAMYPREZ YouTube Manager es el primer
cliente, no el dueño.

```
Automatización (ChatGPT, n8n, script, cron)
  → POST https://samy-os-seven.vercel.app/api/notifications/whatsapp
  → lib/server/notifications.ts   (auth, validación, destinatarios, plantillas)
  → lib/server/twilio-whatsapp.ts (Twilio WhatsApp API)
  → WhatsApp
```

## Por qué vive aquí

Samy OS ya es el backend con HTTPS público, secretos del lado servidor y deploy
automático desde `main`. Montar otro proyecto habría duplicado infraestructura
que ya funciona. La ruta es nueva y aislada: no toca `/api/chatgpt`,
`/api/dashboard` ni el webhook de WhatsApp Cloud que ya existía.

## Endpoint

`POST /api/notifications/whatsapp`

Cabeceras:

```
Authorization: Bearer <NOTIFICATION_API_KEY>
Content-Type: application/json
```

Cuerpo mínimo:

```json
{
  "to": "+16474692835",
  "message": "SAMYPREZ YouTube Manager alert",
  "source": "samyprez-youtube",
  "priority": "normal"
}
```

Varios destinatarios (números, alias, o `all`):

```json
{
  "recipients": ["+16474692835", "partner"],
  "message": "Mensaje aquí",
  "source": "money-tracker"
}
```

Campos:

| Campo | Obligatorio | Qué hace |
|---|---|---|
| `to` | uno de los dos | Un número E.164 o un alias del directorio. |
| `recipients` | uno de los dos | Lista de números o alias. `all` = todos los alias configurados. Máx. 20. |
| `message` | sí (salvo con `template`) | Texto del mensaje. Máx. 4096 caracteres. |
| `source` | no | Quién avisa: `samyprez-youtube`, `dominican-content-radar`, `money-tracker`, `amazing-solutions`, `system-alert`… Solo minúsculas, números, `-`, `_`, `.`. Por defecto `system-alert`. |
| `priority` | no | `low`, `normal` (por defecto), `high`, `urgent`. Las dos últimas añaden un prefijo visible. |
| `template` | no | Arma el texto en el servidor. Ver abajo. |
| `data` | no | Datos de la plantilla. |
| `content_sid` | no | Plantilla aprobada de Twilio, para escribir fuera de la ventana de 24 h. |
| `content_variables` | no | Variables de esa plantilla. |

Si no mandas ni `to` ni `recipients`, va a `NOTIFICATION_DEFAULT_RECIPIENTS`
(por defecto, el alias `samy`).

Respuesta correcta (200):

```json
{
  "ok": true,
  "source": "samyprez-youtube",
  "provider": "twilio",
  "priority": "normal",
  "message_length": 38,
  "sent": 1,
  "failed": 0,
  "results": [{ "to": "+16474692835", "status": "sent", "sid": "SM0123…" }]
}
```

Códigos: `200` todo entregado · `207` entrega parcial · `400` petición
inválida · `401` sin autenticación o clave incorrecta · `429` límite de envíos
o mensaje repetido · `503` falta configuración · `502` Twilio los rechazó todos.

`GET` en la misma URL (con el mismo Bearer) no envía nada: dice qué proveedor
está activo, qué variables faltan y qué alias hay cargados (con el número
enmascarado). Es la forma barata de comprobar un deploy.

## Plantillas

`template: "samyprez-youtube"` con `data`:

```json
{
  "template": "samyprez-youtube",
  "source": "samyprez-youtube",
  "data": {
    "do_next": "Record \"¿Todavía vale la pena emigrar a Canadá siendo dominicano en 2026?\"",
    "prep_next": "\"Después de vivir en Canadá, estas 7 cosas de RD las veo diferente\"",
    "kpi": "Watch CTR and first 30-second retention."
  }
}
```

produce:

```
SAMYPREZ YOUTUBE MANAGER

DO NEXT:
Record "¿Todavía vale la pena emigrar a Canadá siendo dominicano en 2026?"

PREP NEXT:
"Después de vivir en Canadá, estas 7 cosas de RD las veo diferente"

KPI:
Watch CTR and first 30-second retention.

Manager review completed.
```

`template: "generic"` sirve para el resto (`title`, `body`, `items`, `action`).
Los campos vacíos se omiten en vez de imprimir un encabezado solo.

## Variables de entorno

Todas en Vercel → Project Settings → Environment Variables. Ninguna en el
código, ninguna en el repo.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NOTIFICATION_API_KEY` | sí | La clave del gateway. Si falta, se acepta `ASSISTANT_API_KEY`. |
| `TWILIO_ACCOUNT_SID` | sí | Cuenta de Twilio. |
| `TWILIO_AUTH_TOKEN` | sí | Token de Twilio. |
| `TWILIO_WHATSAPP_FROM` | sí* | Remitente. Sandbox: `+14155238886`. Producción: tu número registrado. |
| `TWILIO_MESSAGING_SERVICE_SID` | no | Alternativa a `TWILIO_WHATSAPP_FROM`. |
| `SAMY_WHATSAPP` | sí | Alias `samy`. `+16474692835`. |
| `PARTNER_WHATSAPP` | no | Alias `partner`. |
| `NOTIFY_WHATSAPP_<ALIAS>` | no | Cualquier otro destinatario, sin tocar código. |
| `NOTIFICATION_DEFAULT_RECIPIENTS` | no | A quién va un mensaje sin destinatario. Por defecto `samy`. |
| `NOTIFICATION_PROVIDER` | no | `twilio` (por defecto) o `meta`. |
| `NOTIFICATION_RATE_LIMIT` | no | Envíos por fuente y ventana. Por defecto 20. |
| `NOTIFICATION_RATE_WINDOW_MS` | no | Ventana del límite. Por defecto 60000. |
| `NOTIFICATION_DEDUPE_WINDOW_MS` | no | Bloquea el mismo mensaje al mismo número. Por defecto 60000. `0` lo desactiva. |

\* o `TWILIO_MESSAGING_SERVICE_SID`.

## Sandbox de Twilio

En Sandbox, **cada destinatario tiene que unirse una vez**: mandar por WhatsApp
`join <dos-palabras>` al número del Sandbox (normalmente +1 415 523 8886). El
código aparece en Twilio Console → Messaging → Try it out → Send a WhatsApp
message. Sin ese paso Twilio responde 63024 y el gateway lo devuelve con la
explicación.

En producción, con un remitente de WhatsApp registrado, no hace falta unirse,
pero fuera de la ventana de 24 horas solo se puede enviar una plantilla
aprobada: para eso está `content_sid`.

## Pruebas

```bash
npm run test:whatsapp
```

Levanta un Twilio falso y un `next dev` apuntando a él, y comprueba 29 cosas:
401 sin token y con token incorrecto, los 400 de validación, la máscara de los
números en el `GET`, el SID de vuelta, `whatsapp:+E164` en el `To`, alias,
varios destinatarios, la plantilla SAMYPREZ, el prefijo de prioridad, el
descarte de duplicados, el 429 por límite, el error 63024 de Twilio con su
pista, y que ningún secreto aparece en la respuesta. No manda nada real.

Contra el deploy, sin enviar:

```bash
node scripts/test-whatsapp-gateway.mjs --url https://samy-os-seven.vercel.app --key <NOTIFICATION_API_KEY>
```

Y con envío real:

```bash
node scripts/test-whatsapp-gateway.mjs --url https://samy-os-seven.vercel.app --key <NOTIFICATION_API_KEY> --send
```

## Cómo lo llama una automatización externa

```bash
curl -X POST https://samy-os-seven.vercel.app/api/notifications/whatsapp \
  -H "Authorization: Bearer $NOTIFICATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+16474692835",
    "message": "SAMYPREZ Manager connected successfully.",
    "source": "samyprez-youtube"
  }'
```

El SAMYPREZ Channel Manager de ChatGPT corre lunes y jueves; al terminar su
auditoría, esta es la llamada que tiene que hacer. La URL es pública por HTTPS
y la protege la clave, así que no necesita acceso a nada local.

Si el Channel Manager es un GPT con Actions en vez de un script, no hace falta
escribir la llamada a mano: el esquema de Samy OS
(`/api/chatgpt/openapi`, también en `/openapi.json`) ya incluye la operación
**`samyOsNotifyWhatsApp`** apuntando a esta ruta. Se importa el esquema, se pone
la misma clave como Bearer y el GPT la llama solo. Está marcada como *no
consecuencial* a propósito: el destinatario por defecto es el propio teléfono de
Samuel y la automatización corre sin nadie delante, así que un diálogo de
confirmación la dejaría colgada.

## Registro

Cada envío escribe una línea `[whatsapp-gateway] {...}` en los logs de Vercel
con la hora, la fuente, el destino, el estado, el SID y el error si lo hubo.
Nunca el token de Twilio, ni la clave del gateway, ni la cabecera de
autorización, ni el texto del mensaje.

## Correo

El YouTube Manager sigue mandando sus informes a samyprez@gmail.com y
anacapotillo@gmail.com. Nada de eso se tocó: esto es solo WhatsApp.

## Conector MCP (cómo lo llaman las rutinas de ChatGPT)

Las tareas programadas de Samuel corren en un **chat normal** de ChatGPT, no
dentro de un GPT. Eso importa más de lo que parece:

- un chat normal tiene los conectores (vidIQ, Gmail, Calendar) pero **no** tiene
  Actions de GPT;
- un GPT personalizado tiene Actions pero **no** puede usar vidIQ, que es de
  donde el Channel Manager saca vistas, retención y score de títulos.

Mover la rutina al GPT habría cambiado el aviso de WhatsApp por los datos del
canal. Por eso el gateway se expone además como **servidor MCP**, que sí se ve
desde el chat normal: las cinco rutinas pueden usarlo sin tocar ninguna.

```
POST https://samy-os-seven.vercel.app/api/mcp
```

Herramientas: `enviar_whatsapp` y `estado_whatsapp`.

### Autenticación

ChatGPT solo ofrece OAuth, "sin autenticación" o mixta en los complementos
personalizados. Sin autenticación dejaría abierto un endpoint que manda
mensajes y gasta saldo de Twilio, así que hay un flujo OAuth mínimo que el
cliente descubre solo:

| Ruta | Qué hace |
|---|---|
| `/.well-known/oauth-protected-resource` | Dice qué servidor autoriza el recurso. |
| `/.well-known/oauth-authorization-server` | Endpoints y PKCE S256 obligatorio. |
| `/api/mcp/oauth/register` | Registro dinámico. El `client_id` **es** el registro firmado. |
| `/api/mcp/oauth/authorize` | Pantalla de consentimiento: pide la clave del gateway. |
| `/api/mcp/oauth/token` | Canjea el código verificando PKCE. |

**Nada se almacena.** Clientes, códigos y tokens van firmados con HMAC y llevan
su caducidad dentro, así que un solo usuario no arrastra tres tablas nuevas ni
estado que limpiar. La firma sale de `MCP_OAUTH_SECRET`, o de
`NOTIFICATION_API_KEY` si aquella no existe.

### Pruebas

```bash
npm run test:mcp -- --url https://samy-os-seven.vercel.app --key <clave>
```

Recorre lo mismo que recorre ChatGPT al añadir el complemento y comprueba 16
cosas: descubrimiento, 401 sin token, el `WWW-Authenticate` que dice dónde
autenticarse, registro dinámico, clave incorrecta, PKCE manipulado, canje del
código y el protocolo entero. Con `--send` entrega un WhatsApp real (17).

### Por qué `data` se parsea aunque llegue como texto

ChatGPT serializa a veces los objetos anidados como cadena JSON. Descartarlos
producía el peor fallo posible: un aviso con la cabecera y el pie y nada en
medio, devolviendo 200. Se vio en el primer envío real desde el GPT. Por eso
`coerceTemplateData` acepta las dos formas, y cada llamada con plantilla deja
en el log qué campos trajo — los nombres, nunca el contenido.


---

## Entrante, borradores y diagnóstico (añadido el 8-nov-2026)

### Qué permite realmente Twilio en esta cuenta

| Capacidad | ¿Se puede? |
|---|---|
| Recibir mensajes individuales al número de Twilio | Sí, por webhook firmado. Solo lo que llegue después de configurarlo. |
| Responder con texto libre | Solo dentro de las 24 h siguientes al último mensaje de esa persona. |
| Iniciar conversación / escribir fuera de 24 h | Solo con plantilla aprobada (`content_sid`, `HX…`). En Sandbox, solo a números que hicieron `join`. |
| Leer o escribir en **grupos** de WhatsApp | **No.** La API de WhatsApp Business no da acceso a grupos. |
| Leer el historial del WhatsApp personal de Samy | **No.** |

Fuentes: [Overview WhatsApp + Twilio](https://www.twilio.com/docs/whatsapp/api), [error 63016](https://www.twilio.com/docs/api/errors/63016), [seguridad de webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

### Webhook entrante: `POST /api/whatsapp/twilio`

- Configurar en Twilio Console (Sandbox o el remitente de WhatsApp → *A message comes in*, método POST) la URL exacta `https://samy-os-seven.vercel.app/api/whatsapp/twilio`, y poner **esa misma** URL en `TWILIO_WEBHOOK_URL` en Vercel. Con esa variable, cada envío pide además recibos de entrega (`StatusCallback`) al mismo endpoint.
- Valida `X-Twilio-Signature` (HMAC-SHA1 con `TWILIO_AUTH_TOKEN`) y que `AccountSid` sea la cuenta propia. Sin firma válida → 403.
- Idempotente: los mensajes se insertan una sola vez por `MessageSid`; los recibos solo hacen avanzar el estado (un `sent` repetido no pisa un `delivered`). Por eso reenviar una petición capturada no tiene efecto.
- Guarda en `whatsapp_messages` (la misma tabla del webhook de Meta, con `provider = 'twilio'`). Los logs no incluyen texto ni números completos.
- El webhook de Meta (`/api/whatsapp/webhook`) sigue igual.

### Avisos vs. terceros

`/api/notifications/whatsapp` ahora solo envía a números del directorio (`SAMY_WHATSAPP`, `PARTNER_WHATSAPP`, `NOTIFY_WHATSAPP_*`). Un número fuera → 403 `recipient_not_in_directory`. Los avisos y plantillas existentes no cambian.

Para escribir a un tercero: `POST /api/whatsapp/drafts` (Bearer `ASSISTANT_API_KEY`).

1. `{"action":"create","to":"+1…","body":"…"}` (o `content_sid` + `content_variables`, y opcional `hub_client_id`). El destinatario debe estar identificado: cliente del Hub cuyo teléfono coincide, o alguien que ya escribió al número de Twilio. Devuelve `draft_id` y `approval_hash`.
2. Mostrar a Samy destinatario y texto exactos.
3. Solo con su aprobación: `{"action":"approve_and_send","draft_id":"…","approval_hash":"…","approved":true}`. Cualquier cambio exige un borrador nuevo. Un segundo intento con el mismo borrador da 409, nunca un doble envío.
4. `{"action":"cancel","draft_id":"…"}` · `GET` lista borradores con números enmascarados.

### Diagnóstico separado

`consultar_samy_os` → `connector_status` → `whatsapp.diagnostics`:
`configuration` (variables, modo sandbox/registrado), `authentication` (lectura real de la cuenta en Twilio, sin enviar), `sending.verified` (solo si Twilio confirmó una entrega por el webhook firmado), `receiving.verified` (solo si llegó un mensaje firmado). Lectura del inbox: operación `list_whatsapp_messages`.

Requiere aplicar `supabase/migrations/004_twilio_whatsapp_inbox.sql` (solo añade columnas y una tabla).
