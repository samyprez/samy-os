// Fuente única del contrato OpenAPI de Samy OS.
// Lo sirven /openapi.json y /api/chatgpt/openapi para que nunca se desincronicen.

export function buildSamyOsOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Samy OS",
      version: "1.0.0",
      description:
        "Sistema operativo personal de Samy. Permite crear y consultar tareas y notas, marcar tareas como completadas, ver un resumen general del día, y leer y enviar correos desde su Gmail. Usa este API cada vez que Samy pida recordar algo, anotar algo, revisar sus pendientes, cerrar una tarea, revisar su correo o mandar un email. También manda avisos cortos por WhatsApp al teléfono de Samy con samyOsNotifyWhatsApp.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/chatgpt": {
        post: {
          operationId: "samyOs",
          summary: "Leer o actualizar Samy OS",
          description:
            "Ejecuta una operación sobre los datos de Samy OS. Antes de crear una tarea con fecha relativa (mañana, el viernes, la semana que viene), convierte la fecha a formato YYYY-MM-DD usando la zona horaria America/Toronto.",
          // Without this, ChatGPT treats every POST as consequential, prompts on
          // every single call and never offers "always allow" — which makes
          // hands-free voice use impossible. This endpoint only writes to Samy's
          // own tasks and notes and deletes nothing, so the prompt buys little.
          "x-openai-isConsequential": false,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["operation"],
                  properties: {
                    operation: {
                      type: "string",
                      enum: [
                        "overview",
                        "list_tasks",
                        "create_task",
                        "complete_task",
                        "list_notes",
                        "create_note",
                        "list_clients",
                        "create_client",
                        "update_client",
                        "list_events",
                        "create_event",
                        "delete_event",
                        "list_brands",
                        "create_brand",
                        "list_health",
                        "create_health",
                        "search_email",
                        "read_email",
                        "list_projects",
                        "create_project",
                        "update_project",
                        "add_project_note",
                        "list_hub_clients",
                        "list_invoices",
                        "create_invoice",
                        "confirm_invoice",
                      ],
                      description:
                        "IMPORTANTE (2026-08-11): tareas/proyectos, clientes y notas viven SOLO en la oficina virtual (app.amazingsolutions.ca, el Hub) — ya no existe una lista de tareas, clientes ni notas separada dentro de Samy OS. list_tasks, create_task y complete_task son alias de las operaciones del Hub: list_tasks lista el tablero (filtra por status o query), create_task crea una tarjeta nueva (requiere title; usa name o related_to para el cliente si aplica), complete_task la marca terminada (requiere task_id, o basta el nombre/title si no tienes el id). list_clients, create_client y update_client son los clientes reales del Hub (requiere name para crear; client_id para actualizar, o basta el nombre). list_notes y create_note son el tablero de notas del Hub (estilo Google Keep, con checklist y notas fijadas): list_notes lista las pendientes, create_note crea una nueva (requiere body; title opcional). list_hub_clients y list_projects/create_project/update_project/add_project_note siguen existiendo como sinónimos exactos de list_clients y list_tasks/create_task/complete_task/add_project_note respectivamente — usa cualquiera de los dos nombres, van al mismo lugar. add_project_note añade una nota al historial de una tarjeta (requiere project y note). list_invoices lista facturas con montos y vencimientos. overview: resumen de tareas, notas y clientes del Hub más los próximos eventos del calendario. list_events: próximos eventos del Google Calendar real de Samy (o búsqueda si mandas query) — es el calendario de su teléfono, no una lista aparte. create_event: agendar un evento en ese calendario (requiere title y starts_at; due_date NO aplica aquí). delete_event: cancelar un evento (requiere task_id o basta el título; si hay varios que coinciden, devuelve la lista para preguntarle a Samy cuál). list_brands: listar marcas. create_brand: registrar una marca (requiere name). list_health: listar registros de salud personal (los más recientes primero, o busca con query en el estado de ánimo o las notas). create_health: guardar un registro de salud (requiere al menos uno de: body con la nota libre, sleep_hours, energy_level de 1 a 10, water_glasses, movement_minutes, mood; entry_date por defecto es hoy). Salud es SOLO de Samy OS, no toca el Hub. search_email: buscar correos en el Gmail de Samy con la sintaxis de Gmail en query (por ejemplo 'from:cliente@correo.com', 'is:unread', 'newer_than:7d'); devuelve remitente, asunto, fecha y un extracto, más el id de cada mensaje. read_email: leer un correo completo (requiere message_id, sacado antes de search_email); úsalo cuando el extracto no alcance para responder.",
                    },
                    title: {
                      type: "string",
                      description:
                        "Nombre de la tarea (create_task) o del proyecto (create_project). Obligatorio en ambas.",
                    },
                    area: {
                      type: "string",
                      description:
                        "Área o proyecto al que pertenece la tarea, por ejemplo 'Amazing Solutions' o 'Personal'. Si no se menciona, omitir.",
                    },
                    priority: {
                      type: "string",
                      enum: ["Alta", "Media", "Baja"],
                      description: "Prioridad. Si no se menciona, omitir (por defecto queda Media).",
                    },
                    due_date: {
                      type: "string",
                      description:
                        "Fecha límite en formato YYYY-MM-DD, ya resuelta a fecha real. Zona horaria America/Toronto.",
                    },
                    task_id: {
                      type: "string",
                      description:
                        "Tarea a completar (complete_task): id o basta el nombre/título (por ejemplo 'Alex Mecánico'). Si varios coinciden, devuelve la lista para preguntarle a Samy cuál.",
                    },
                    query: {
                      type: "string",
                      description:
                        "Texto de búsqueda para list_tasks o list_notes. Filtra por título/área o por contenido. Para search_email usa la sintaxis de búsqueda de Gmail, por ejemplo 'from:maria@correo.com newer_than:14d' o 'subject:factura is:unread'.",
                    },
                    body: {
                      type: "string",
                      description: "Contenido de la nota. Obligatorio para create_note. También sirve como nota libre en create_health.",
                    },
                    related_to: {
                      type: "string",
                      description:
                        "Cliente, proyecto o persona con la que se relaciona la nota o el evento.",
                    },
                    client_id: {
                      type: "string",
                      description:
                        "Cliente a actualizar (update_client): id o basta el nombre de la empresa. Si varios coinciden, devuelve la lista para preguntarle a Samy cuál.",
                    },
                    name: {
                      type: "string",
                      description: "Nombre del cliente o de la marca. Obligatorio para create_client y create_brand.",
                    },
                    contact: {
                      type: "string",
                      description:
                        "NOMBRE de la persona de contacto del cliente, por ejemplo 'Adetri Pérez'. Para el correo, el teléfono o el sitio web usa email, phone y website.",
                    },
                    email: {
                      type: "string",
                      description:
                        "Correo del cliente (update_client). Samy suele dictarlo mal: si no estás seguro, léeselo de vuelta letra por letra antes de guardarlo.",
                    },
                    phone: {
                      type: "string",
                      description: "Teléfono del cliente (update_client).",
                    },
                    website: {
                      type: "string",
                      description: "Sitio web o dominio del cliente (update_client), por ejemplo 'ejemplo.ca'.",
                    },
                    amount: {
                      type: "number",
                      description:
                        "Monto de la factura EN DÓLARES, antes de impuestos. 'quinientos' son 500. Obligatorio para create_invoice.",
                    },
                    item_description: {
                      type: "string",
                      description:
                        "Qué se está cobrando, por ejemplo 'Diseño web' o 'Mantenimiento mensual'. Si no se menciona, queda 'Servicios profesionales'.",
                    },
                    tax_rate: {
                      type: "number",
                      description: "Impuesto en porcentaje. Si no se menciona, se aplica 13 (HST Ontario).",
                    },
                    currency: {
                      type: "string",
                      description: "Moneda de la factura. Por defecto 'cad'.",
                    },
                    draft: {
                      type: "boolean",
                      description:
                        "Para create_invoice/confirm_invoice. true SOLO si Samy dijo explícitamente que no la envíes / que quede en borrador ('créala pero no la envíes', 'déjala en borrador'). En ese caso NO se genera link de pago de Stripe ni se marca como enviada. Si no dijo nada de eso, deja false (comportamiento normal: se envía con link de pago).",
                    },
                    service: {
                      type: "string",
                      description: "Servicio que se le presta al cliente, por ejemplo 'sitio web' o 'redes sociales'.",
                    },
                    brand: {
                      type: "string",
                      description: "Marca a la que pertenece el cliente.",
                    },
                    next_step: {
                      type: "string",
                      description: "Próximo paso acordado con el cliente.",
                    },
                    status: {
                      type: "string",
                      description:
                        "Para update_client, uno de: contactado, cliente, no interesado (o los valores internos contacted, client, not_interested). Para las tareas/proyectos (list_tasks, create_task, complete_task y sus sinónimos list_projects/create_project/update_project), uno de: pendiente, en progreso, mensual, urgente, completado. Acepta también los valores internos pending, in_progress, monthly, urgent, completed.",
                    },
                    last_important_message: {
                      type: "string",
                      description: "Último mensaje relevante del cliente. Solo para update_client.",
                    },
                    starts_at: {
                      type: "string",
                      description:
                        "Fecha y hora de inicio del evento en ISO 8601 con offset, por ejemplo 2026-08-12T15:00:00-04:00. Obligatorio para create_event. Zona horaria America/Toronto.",
                    },
                    ends_at: {
                      type: "string",
                      description: "Fecha y hora de fin del evento en ISO 8601 con offset. Opcional.",
                    },
                    location: {
                      type: "string",
                      description: "Lugar del evento.",
                    },
                    description: {
                      type: "string",
                      description: "Detalle adicional del evento, o del proyecto en create_project y update_project.",
                    },
                    delivery_date: {
                      type: "string",
                      description:
                        "Fecha de entrega del proyecto en formato YYYY-MM-DD, ya resuelta a fecha real. Zona horaria America/Toronto. Solo para create_project y update_project.",
                    },
                    type: {
                      type: "string",
                      description: "Tipo de marca, por ejemplo 'restaurante' o 'medio digital'.",
                    },
                    objective: {
                      type: "string",
                      description: "Objetivo de la marca.",
                    },
                    platforms: {
                      type: "string",
                      description: "Plataformas donde vive la marca, por ejemplo 'Instagram, TikTok'.",
                    },
                    content_frequency: {
                      type: "string",
                      description: "Frecuencia de publicación de la marca.",
                    },
                    notes: {
                      type: "string",
                      description: "Notas sueltas sobre la marca.",
                    },
                    entry_date: {
                      type: "string",
                      description: "Fecha del registro de salud en formato YYYY-MM-DD. Si no se menciona, es hoy. Solo para create_health.",
                    },
                    sleep_hours: {
                      type: "number",
                      description: "Horas dormidas. Solo para create_health.",
                    },
                    energy_level: {
                      type: "integer",
                      description: "Nivel de energía de 1 a 10. Solo para create_health.",
                    },
                    water_glasses: {
                      type: "integer",
                      description: "Vasos de agua tomados. Solo para create_health.",
                    },
                    movement_minutes: {
                      type: "integer",
                      description: "Minutos de ejercicio o movimiento. Solo para create_health.",
                    },
                    mood: {
                      type: "string",
                      description: "Estado de ánimo en una o dos palabras, por ejemplo 'bien' o 'estresado'. Solo para create_health.",
                    },
                    limit: {
                      type: "integer",
                      description:
                        "Cantidad de correos a devolver en search_email. Por defecto 10, máximo 25.",
                    },
                    message_id: {
                      type: "string",
                      description:
                        "Id del mensaje de Gmail. Obligatorio para read_email. Consíguelo primero con search_email.",
                    },
                    project: {
                      type: "string",
                      description:
                        "Proyecto de la oficina virtual, por nombre o por id. Obligatorio para update_project y add_project_note. Basta parte del nombre, por ejemplo 'Salami' o 'Prints of hope'. Si varios coinciden, la acción devuelve la lista para que le preguntes a Samy cuál.",
                    },
                    progress_percent: {
                      type: "integer",
                      description:
                        "Avance del proyecto, de 0 a 100. Solo para update_project. Al llegar a 100 el proyecto pasa a completado automáticamente.",
                    },
                    note: {
                      type: "string",
                      description:
                        "Texto que se añade al historial de notas del proyecto, con fecha. No reemplaza las notas anteriores. Obligatorio para add_project_note.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Operación completada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      message: {
                        type: "string",
                        description: "Confirmación en español para mostrarle a Samy.",
                      },
                      duplicate: {
                        type: "boolean",
                        description: "true si la tarea ya existía y no se duplicó.",
                      },
                      task: { type: "object" },
                      note: { type: "object" },
                      client: { type: "object" },
                      event: { type: "object" },
                      brand: { type: "object" },
                      tasks: { type: "array", items: { type: "object" } },
                      notes: { type: "array", items: { type: "object" } },
                      clients: { type: "array", items: { type: "object" } },
                      events: { type: "array", items: { type: "object" } },
                      brands: { type: "array", items: { type: "object" } },
                      health: {
                        description: "Un registro (create_health) o una lista de registros (list_health) de salud personal.",
                      },
                      project: { type: "object" },
                      projects: { type: "array", items: { type: "object" } },
                      invoices: { type: "array", items: { type: "object" } },
                      candidates: {
                        type: "array",
                        items: { type: "object" },
                        description:
                          "Proyectos que coinciden cuando el nombre es ambiguo. Muéstraselos a Samy y pregúntale cuál, no elijas tú.",
                      },
                      email: {
                        type: "object",
                        description: "Correo completo devuelto por read_email, con body ya en texto plano.",
                      },
                      emails: {
                        type: "array",
                        items: { type: "object" },
                        description: "Resultados de search_email: id, thread_id, from, to, subject, date y snippet.",
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Falta un campo obligatorio" },
            "401": { description: "Token inválido o ausente" },
            "500": { description: "Error de configuración del servidor o de la base de datos" },
          },
        },
      },
      "/api/chatgpt/send-email": {
        post: {
          operationId: "samyOsSendEmail",
          summary: "Enviar un correo desde el Gmail de Samy",
          // ChatGPT rejects any operation description over 300 characters, and a
          // rejected schema breaks the whole GPT — not just this call. Keep this
          // short; the detailed guidance lives in the field descriptions below.
          description:
            "Envía un correo real desde el Gmail de Samy. Úsalo solo cuando pida explícitamente enviar o contestar un correo. Antes de llamar, muéstrale el destinatario, el asunto y el texto completo, y espera su confirmación. Si nombra a un cliente en vez de una dirección, búscala antes con list_clients.",
          // The main gateway stays non-consequential so ChatGPT does not prompt
          // on every task and note. Sending mail is irreversible and reaches a
          // third party, so it must always show the recipient and body and wait
          // for a confirmation. The flag is per-operation, which is exactly why
          // send gets its own path instead of being another `operation` value.
          "x-openai-isConsequential": true,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["to", "subject", "body"],
                  properties: {
                    to: {
                      type: "string",
                      description:
                        "Dirección del destinatario. Para varios, sepáralos con coma. Nunca la inventes: si Samy nombró a un cliente, sácala de list_clients o pregúntale.",
                    },
                    subject: {
                      type: "string",
                      description: "Asunto del correo. Obligatorio, breve y concreto.",
                    },
                    body: {
                      type: "string",
                      description:
                        "Cuerpo del correo en texto plano. Usa saltos de línea reales para separar párrafos y cierra con el nombre de Samy.",
                    },
                    cc: {
                      type: "string",
                      description: "Direcciones en copia, separadas por coma. Opcional.",
                    },
                    reply_to_message_id: {
                      type: "string",
                      description:
                        "Id del mensaje al que se responde, obtenido con search_email. Mantiene el correo en el mismo hilo y añade 'Re:' al asunto si falta.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Correo enviado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      message: {
                        type: "string",
                        description: "Confirmación en español para mostrarle a Samy.",
                      },
                      email: {
                        type: "object",
                        description: "Id, thread_id, destinatario y asunto del correo enviado.",
                      },
                      error: {
                        type: "string",
                        description: "Motivo por el que no se pudo enviar, por ejemplo que falte conectar Gmail.",
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Falta to, subject o body" },
            "401": { description: "Token inválido o ausente" },
            "500": { description: "Error de configuración del servidor o de la API de Gmail" },
          },
        },
      },
      "/api/notifications/whatsapp": {
        post: {
          operationId: "samyOsNotifyWhatsApp",
          summary: "Mandar un aviso por WhatsApp a Samy",
          // Under 300 characters: ChatGPT rejects the whole schema past that.
          description:
            "Manda un aviso corto por WhatsApp. Úsalo al terminar la auditoría del SAMYPREZ YouTube Manager y para cualquier alerta que Samy deba ver en el teléfono. El informe largo sigue yendo por correo: aquí van pocas líneas.",
          // Deliberately NOT consequential. The default recipient is Samy's own
          // phone, and the Channel Manager runs unattended on Monday and
          // Thursday — a confirmation prompt would stop the automation dead.
          "x-openai-isConsequential": false,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    to: {
                      type: "string",
                      description:
                        "Destinatario: un alias configurado ('samy', 'partner', 'all') o un número E.164 (+16474692835). Si se omite, va a Samy.",
                    },
                    recipients: {
                      type: "array",
                      items: { type: "string" },
                      description: "Varios destinatarios a la vez, alias o números E.164. Alternativa a 'to'.",
                    },
                    message: {
                      type: "string",
                      description:
                        "Texto del aviso, en español y breve (WhatsApp corta a 4096 caracteres). Con 'template' se usa como nota extra.",
                    },
                    source: {
                      type: "string",
                      description:
                        "Qué automatización avisa: samyprez-youtube, dominican-content-radar, money-tracker, amazing-solutions o system-alert. Solo minúsculas, números y guiones.",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "normal", "high", "urgent"],
                      description: "'high' y 'urgent' añaden un aviso visible al principio. Por defecto 'normal'.",
                    },
                    template: {
                      type: "string",
                      description:
                        "Formato del mensaje: 'samyprez-youtube' para el aviso del canal, 'generic' para el resto. Con plantilla, el texto se arma en el servidor desde 'data'.",
                    },
                    // Cada campo va declarado uno a uno a propósito. ChatGPT
                    // descarta las claves que el esquema no nombra, así que un
                    // `type: "object"` suelto llega vacío al servidor y el aviso
                    // sale con la cabecera y el pie y nada en medio.
                    data: {
                      type: "object",
                      description: "Campos de la plantilla. Rellena solo los que apliquen; los vacíos se omiten.",
                      properties: {
                        do_next: {
                          type: "string",
                          description: "samyprez-youtube: lo que Samy tiene que grabar ahora. Título exacto entre comillas.",
                        },
                        prep_next: {
                          type: "string",
                          description: "samyprez-youtube: el siguiente vídeo a preparar.",
                        },
                        kpi: {
                          type: "string",
                          description: "samyprez-youtube: la métrica a vigilar, en una frase.",
                        },
                        note: {
                          type: "string",
                          description: "Una línea extra de contexto. Opcional.",
                        },
                        title: {
                          type: "string",
                          description: "generic: encabezado del aviso. Sale en mayúsculas.",
                        },
                        body: {
                          type: "string",
                          description: "generic: resumen en una o dos frases.",
                        },
                        items: {
                          type: "array",
                          items: { type: "string" },
                          description: "generic: puntos sueltos, salen como lista con viñetas.",
                        },
                        action: {
                          type: "string",
                          description: "generic: lo que Samy debe hacer.",
                        },
                        footer: {
                          type: "string",
                          description: "Cierre del mensaje. Opcional.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Enviado a todos los destinatarios",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      source: { type: "string" },
                      provider: { type: "string" },
                      sent: { type: "integer", description: "Cuántos avisos salieron." },
                      failed: { type: "integer" },
                      results: {
                        type: "array",
                        items: { type: "object" },
                        description: "Uno por destinatario, con el Message SID o el motivo del fallo.",
                      },
                    },
                  },
                },
              },
            },
            "207": { description: "Llegó a unos destinatarios y a otros no" },
            "400": { description: "Falta el mensaje, o el destinatario o la plantilla no son válidos" },
            "401": { description: "Token inválido o ausente" },
            "429": { description: "Demasiados avisos seguidos desde el mismo source" },
            "502": { description: "WhatsApp rechazó el envío (revisa 'results' para el motivo)" },
            "503": { description: "Faltan las credenciales de Twilio en el servidor" },
          },
        },
      },
      "/api/health": {
        get: {
          operationId: "samyOsHealth",
          summary: "Revisar el estado de Samy OS",
          description:
            "Comprueba que Supabase, las tablas, OpenAI, Gmail y la puerta de entrada de ChatGPT estén configurados. No requiere token.",
          responses: {
            "200": {
              description: "Estado del sistema",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      supabase: { type: "boolean" },
                      tablesReady: { type: "boolean" },
                      openai: { type: "boolean" },
                      chatgptGateway: {
                        type: "boolean",
                        description:
                          "false significa que faltan variables de entorno y ChatGPT no puede escribir.",
                      },
                      gmail: {
                        type: "object",
                        description:
                          "configured dice si están las tres variables de Google; works dice si el refresh token todavía sirve; address es la cuenta conectada.",
                      },
                    },
                  },
                },
              },
            },
            "500": { description: "El chequeo de salud falló" },
          },
        },
      },
    },
    components: {
      // ChatGPT's Action validator rejects the document with "In components
      // section, schemas subsection is not an object" when components.schemas
      // is absent. An invalid Action breaks the whole GPT — every message
      // fails, even ones that never call it. Keep this key even when empty.
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  } as const;
}
