import "server-only";

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Autorización OAuth para el servidor MCP de Samy OS.
 *
 * ChatGPT no ofrece autenticación por clave API en los complementos
 * personalizados: solo OAuth, "sin autenticación" o mixta. Dejar sin
 * autenticación un endpoint que manda WhatsApps y gasta saldo de Twilio no es
 * una opción, así que aquí está el mínimo flujo OAuth que el cliente descubre
 * solo (registro dinámico + PKCE).
 *
 * Todo va firmado, nada almacenado. Un solo usuario no justifica tablas nuevas
 * para clientes, códigos y tokens: cada artefacto lleva su propio contenido
 * firmado con HMAC y su caducidad dentro, así que el servidor no recuerda nada
 * entre peticiones y no hay estado que se desincronice ni que limpiar.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export class OAuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.status = status;
  }
}

function signingSecret() {
  // MCP_OAUTH_SECRET es lo propio, pero caer en la clave del gateway evita que
  // el conector quede muerto por una variable de entorno que nadie definió.
  const secret = process.env.MCP_OAUTH_SECRET?.trim() || process.env.NOTIFICATION_API_KEY?.trim();
  if (!secret) {
    throw new OAuthError("server_error", "Falta MCP_OAUTH_SECRET o NOTIFICATION_API_KEY", 503);
  }
  return secret;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(kind: string, payload: Record<string, unknown>) {
  const body = b64url(JSON.stringify({ ...payload, kind }));
  const mac = createHmac("sha256", signingSecret()).update(`${kind}.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

function verify<T extends Record<string, unknown>>(kind: string, token: string): T | null {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", signingSecret()).update(`${kind}.${body}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.kind !== kind) return null;
  if (typeof parsed.exp === "number" && Date.now() > parsed.exp) return null;
  return parsed as T;
}

/* ------------------------------------------------- registro de clientes --- */

export type ClientRecord = { client_id: string; redirect_uris: string[] };

/** El client_id ES el registro firmado, así que no hay nada que guardar. */
export function registerClient(redirectUris: string[]): ClientRecord {
  const uris = redirectUris.map((uri) => String(uri).trim()).filter(Boolean);
  if (!uris.length) throw new OAuthError("invalid_redirect_uri", "Falta redirect_uris");
  for (const uri of uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new OAuthError("invalid_redirect_uri", `redirect_uri inválida: ${uri}`);
    }
    // Sin esto, cualquiera que descubra el client_id podría desviar el código
    // de autorización a un sitio que controle.
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new OAuthError("invalid_redirect_uri", "Las redirect_uri deben ser https");
    }
  }
  return { client_id: sign("client", { uris, iat: Date.now() }), redirect_uris: uris };
}

export function clientRedirectUris(clientId: string): string[] | null {
  const parsed = verify<{ uris: string[] }>("client", clientId);
  return parsed?.uris ?? null;
}

/* --------------------------------------------------------------- códigos --- */

export function issueCode(clientId: string, redirectUri: string, challenge: string) {
  return sign("code", {
    cid: createHash("sha256").update(clientId).digest("base64url").slice(0, 32),
    uri: redirectUri,
    chal: challenge,
    exp: Date.now() + CODE_TTL_MS,
    nonce: randomBytes(8).toString("base64url"),
  });
}

/** Canjea el código verificando PKCE S256 y que la redirect_uri no cambió. */
export function redeemCode(code: string, clientId: string, redirectUri: string, verifier: string) {
  const parsed = verify<{ cid: string; uri: string; chal: string }>("code", code);
  if (!parsed) throw new OAuthError("invalid_grant", "Código inválido o caducado");

  const cid = createHash("sha256").update(clientId).digest("base64url").slice(0, 32);
  if (parsed.cid !== cid) throw new OAuthError("invalid_grant", "El código no es de este cliente");
  if (parsed.uri !== redirectUri) throw new OAuthError("invalid_grant", "redirect_uri no coincide");

  const computed = createHash("sha256").update(String(verifier || "")).digest("base64url");
  if (computed !== parsed.chal) throw new OAuthError("invalid_grant", "PKCE no verifica");

  return sign("access", { exp: Date.now() + TOKEN_TTL_MS, iat: Date.now() });
}

export function accessTokenValid(token: string) {
  return verify("access", token) != null;
}

export const ACCESS_TOKEN_TTL_SECONDS = Math.floor(TOKEN_TTL_MS / 1000);
