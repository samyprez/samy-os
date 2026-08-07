import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Samy OS ChatGPT Gateway",
      version: "1.0.0",
      description: "Secure gateway for ChatGPT to read and update Samy OS tasks and notes.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/chatgpt": {
        post: {
          operationId: "samyOs",
          summary: "Read or update Samy OS",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    operation: {
                      type: "string",
                      enum: ["overview", "list_tasks", "create_task", "complete_task", "list_notes", "create_note"],
                    },
                    title: { type: ["string", "null"] },
                    area: { type: ["string", "null"] },
                    priority: { type: ["string", "null"], enum: ["Alta", "Media", "Baja", null] },
                    due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
                    task_id: { type: ["string", "null"] },
                    query: { type: ["string", "null"] },
                    body: { type: ["string", "null"] },
                    related_to: { type: ["string", "null"] },
                  },
                  required: ["operation"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Successful Samy OS operation" },
            "400": { description: "Invalid request" },
            "401": { description: "Unauthorized" },
            "500": { description: "Server configuration or database error" },
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
  });
}
