import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Samy OS",
  description: "Centro de operaciones de Samy Prez",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
