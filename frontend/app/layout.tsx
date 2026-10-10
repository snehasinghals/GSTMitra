import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { LayoutShell } from "./components/LayoutShell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "GSTMitra — Simple GST Filing for Small Businesses",
  description: "Prepare and file GST returns step-by-step in plain words without fear.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-50 antialiased">
      <body className="h-full flex flex-col font-sans text-slate-900">
        <AuthProvider>
          <Navbar />
          <LayoutShell>{children}</LayoutShell>
        </AuthProvider>
      </body>
    </html>
  );
}
