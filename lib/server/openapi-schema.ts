// Fuente única del contrato OpenAPI de Samy OS.
// Lo sirven /openapi.json y /api/chatgpt/openapi para que nunca se desincronicen.

export function buildSamyOsOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Samy OS",
      version: "1.0.0",
      description:
        "Sistema operativo personal de Samy. Permite crear y consultar tareas y notas, marcar tareas como completadas, y ver un resumen general del día. Usa este API cada vez que Samy pida recordar algo, anotar algo, revisar sus pendientes o cerrar una tarea.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/chatgpt": {
        post: {
          operationId: "samyOs",
          summary: "Leer o actualizar Samy OS",
          description:
            "Ejecuta una operación sobre los datos de Samy OS. Antes de crear una tarea con fecha relativa (mañana, el viernes, la semana que viene), convierte la fecha a formato YYYY-MM-DD usando la zona horaria America/Toronto.",
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
                      ],
                      description:
                        "overview: resumen de pendientes, notas, clientes y próximos eventos. list_tasks: listar tareas (opcionalmente filtradas por query). create_task: crear una tarea nueva (requiere title). complete_task: marcar una tarea como completada (requiere task_id). list_notes: listar notas. create_note: guardar una nota (requiere body).",
                    },
                    title: {
                      type: "string",
                      description: "Nombre de la tarea. Obligatorio para create_task.",
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
                        "UUID de la tarea. Obligatorio para complete_task. Consíguelo primero con list_tasks.",
                    },
                    query: {
                      type: "string",
                      description:
                        "Texto de búsqueda para list_tasks o list_notes. Filtra por título/área o por contenido.",
                    },
                    body: {
                      type: "string",
                      description: "Contenido de la nota. Obligatorio para create_note.",
                    },
                    related_to: {
                      type: "string",
                      description: "Cliente, proyecto o persona con la que se relaciona la nota.",
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
                      tasks: { type: "array", items: { type: "object" } },
                      notes: { type: "array", items: { type: "object" } },
                      clients: { type: "array", items: { type: "object" } },
                      events: { type: "array", items: { type: "object" } },
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
      "/api/health": {
        get: {
          operationId: "samyOsHealth",
          summary: "Revisar el estado de Samy OS",
          description:
            "Comprueba que Supabase, las tablas, OpenAI y la puerta de entrada de ChatGPT estén configurados. No requiere token.",
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
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  } as const;
}
