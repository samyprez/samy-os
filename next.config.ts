import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Los clientes MCP buscan la configuración de OAuth en rutas fijas bajo
    // /.well-known/. El router de app/ no sirve carpetas que empiezan por
    // punto, así que se reescriben a rutas normales dentro de /api.
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/mcp/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/oauth/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/mcp/oauth/authorization-server",
      },
    ];
  },
};

export default nextConfig;
