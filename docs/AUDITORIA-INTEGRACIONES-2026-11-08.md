# Samy OS — auditoría de integración y plan de ampliación (2026-11-08)

## Decisión arquitectónica (NO DUPLICAR)
**Samy OS sigue siendo el gateway e interfaz operativa desde ChatGPT y voz.** Su dashboard es secundario.
**Amazing Business Hub (app.amazingsolutions.ca) sigue siendo la fuente de verdad** para clientes, proyectos/tareas, notas, recordatorios y facturas. La implementación actual en `lib/server/gateway-operations.ts` ya redirige esas operaciones al Hub. No crear otras tablas de CRM ni facturas ni trasladar datos sin migración controlada.
WordPress, Stripe, Gmail, Hostinger, Twilio y plataformas sociales conservan sus propios datos nativos; Samy OS solo orquesta y registra referencias, permisos y resultados.

## Evidencia revisada del código
- `README.md`: `/api/chatgpt`, `/api/dashboard`, OpenAPI dinámico; GPT Actions requiere importación de esquema y secreto del lado servidor.
- `lib/server/gateway-operations.ts`: tareas, notas, clientes, proyectos y facturas ya se gestionan a través del Hub; operaciones `list_invoices`, `create_invoice` y `confirm_invoice` presentes.
- `app/api/health/route.ts`: prueba de la base Samy OS, Gmail, Calendar y Hub; no prueba Stripe, WhatsApp entrante, hosting ni redes sociales.
- `app/api/notifications/whatsapp/route.ts`: gateway Twilio **saliente**, plantillas y diagnóstico autenticado.
- `lib/server/openapi-schema.ts`: contrato actual de ChatGPT; cambios requieren actualizar/importar esquema en GPT Action.

## Pruebas externas realizadas desde ChatGPT el 2026-11-08
| Servicio | Resultado | Alcance comprobado |
| --- | --- | --- |
| Gmail samyprez@gmail.com | autenticación correcta | perfil; acciones de lectura, borrador y envío disponibles; no envío probado |
| Hostinger Mail info@amazingsolutions.ca | autenticación correcta | buzón identificado, API mail disponible; NO es conexión al panel hosting |
| Stripe AMAZING SOLUTIONS | cuenta live identificada | herramientas API disponibles, no se creó ni se verificó cargo |
| Twilio vía Samy OS Avisos | gateway listo, alias samy | avisos salientes; NO lectura de chats/grupos |
| Metricool | marca TorontoDominicano identificada | programación/analítica depende de red y permisos |
| vidIQ Instagram samyprez | perfil manual, acceso público | no permiso publicar ni consultar insights propios |
| WordPress Connector | hay dos links, alias probado devuelve Unknown site alias | resolver alias/cuenta antes de publicar |
| Supabase conectado | proyectos content-studio y New-Amazing-dashboard | no figura proyecto documentado samy-os-PRODUCCION; podría estar en otra organización o cuenta |
| Vercel Samy OS producción | NO verificado | herramientas de consulta web no lograron abrir /api/health; no afirmar caída sin prueba desde red autorizada |

## Matriz de trabajo pendiente
| Capacidad | Destino de datos | Diseño sin duplicación | Verificación de aceptación |
| --- | --- | --- | --- |
| Todos los correos Gmail + Hostinger | buzones nativos | adaptadores por cuenta, lectura; borrador obligatorio antes de enviar y aprobación explícita | leer perfil y un mensaje por cuenta; comprobar identidad de remitente |
| Pagos Stripe | Stripe | verificación de charge/payment intent y metadata, reconciliación por IDs | distinguir paid, pending, refunded y test/live |
| Interac | banco / emails confirmatorios | detectar avisos con Gmail/Hostinger; no afirmar liquidación bancaria únicamente por correo | cotejo comprobante + registro bancario autorizado |
| Facturas y payment links | Hub para facturas existentes; Stripe para enlaces/cobros | nunca duplicar facturas, guardar Stripe IDs y URLs en el Hub | crear borrador/test, verificar webhooks e idempotencia |
| WhatsApp individual | Twilio / Meta Cloud API | webhooks entrantes con firma, inbox por contacto, ventana 24h y templates | enviar/recibir con número autorizado |
| Grupos WhatsApp personales | WhatsApp | **no soportado en API empresarial estándar**; no prometer acceso ni automatizaciones no oficiales | marcar explícitamente unavailable |
| SMS | Twilio | mensajes inbound/outbound en mismo inbox, opt-in y reglas anti-spam | ida/vuelta y opt-out |
| Notificaciones iPhone / DMs redes | cada plataforma | las notificaciones del sistema iOS no son leíbles directamente desde ChatGPT; conectar APIs oficiales de mensajes/comentarios con permiso | recibir evento de prueba en plataforma |
| Hostinger 2 cuentas | paneles originales | inventario de cuentas y sitios por ID; administración vía herramientas o navegador autorizado, sin migrar hosting | enumerar ambas cuentas y sitio ejemplo |
| Leads websites/apps | Hub clientes/leads | identificar empresas con fuentes públicas, puntuación y evitar duplicados, preparar contacto | lead verificable, origen/fecha, consentimiento |
| Reels @samyprez | vidIQ, Instagram | tendencias + guion + revisión + publicación autorizada | conectar OAuth y publicar reel de prueba aprobado |
| Google Ads para marcas/clientes | Google Ads | cuentas por cliente, consentimientos, presupuesto máximo, revisión de campañas | ver ID, conversiones, auditoría de cambios |
| Blogs WordPress SEO | WordPress | categorías/tags, metadatos SEO, featured/secondary images, alt, publicación | prueba draft -> publish y GET verificado |
| Redes Samyprez/Amazing Solutions/TorontoDominicano | API de cada red / Metricool | registro de identidades y permisos por marca, cola de aprobación | comprobar cada marca y red y URL publicada |

## Orden de implementación
**P0 - Acceso y diagnóstico.** Determinar deployment correcto, ejecutar `/api/health` desde entorno autorizado, verificar cuenta Supabase/Vercel, documentar exactamente cuáles cuentas de Hostinger existen. Comprobar importación de esquema de GPT Action. No guardar credenciales en repositorio ni exponerlas en cliente.

**P1 - Unificación de lectura.** Añadir registry de conectores por `brand/account/provider` que distinga `connected`, `permission_missing`, `degraded` y `not_configured`; pruebas funcionales por operación, no solo presencia de claves. Usar Gmail, Hostinger Mail, Stripe y Hub; mantener autorización por cuenta y logs redactados.

**P2 - Comunicación bidireccional.** WhatsApp/Twilio con webhook validado, inbox, SMS, plantillas y controles de consentimiento. No replicar grupos de WhatsApp personales. Preparar siempre correo completo y aprobación explícita antes de envío.

**P3 - Web + marketing.** Resolver WordPress alias, Hostinger 2 cuentas, SEO e imágenes; conectar Instagram OAuth y Meta/Google Ads según permisos; leads hacia Hub existente. Publicaciones, presupuestos y modificaciones sensibles con previsualización y aprobación.

**P4 - Automatizaciones.** Enviar resúmenes por WhatsApp ya disponible, evitar registros duplicados, idempotencia de webhooks y alertas de fallos, seguimiento de cobros, leads y contenido.

## Reglas no negociables
1. Lecturas y diagnósticos pueden ejecutarse sin confirmación; altas/ediciones internas reversibles cuando el usuario lo pidió explícitamente.
2. Nunca enviar email antes de mostrar **remitente, To, CC, BCC, asunto, cuerpo y adjuntos** y obtener aprobación nueva tras cualquier modificación.
3. No publicar en público, enviar mensajes a terceros, gastar en anuncios, mover dinero ni activar cobros sin autorización aplicable a la acción concreta.
4. Identificar explícitamente marca, cuenta y modo Stripe live/test antes de modificar.
5. No atribuir acceso real a la presencia de un plugin o clave: ejecutar smoke tests.
6. Registrar `operation_id`, `provider_record_id`, fuente y estado para evitar dobles cobros, doble CRM y dobles publicaciones.
7. Nunca revelar tokens, datos sensibles o números de teléfono en documentación o logs.
8. Si una operación no puede ejecutarse desde ESTE chat, indicar el puente que falta (GPT Action, plugin privado o API autorizada), sin prometer acceso mágico.

## Estado de esta entrega
Este documento añade una auditoría y una especificación de ampliación al repositorio original; **no implementa por sí solo** las integraciones ausentes. No se modificaron datos productivos ni envíos.
