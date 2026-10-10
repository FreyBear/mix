import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Mixup - sceneoppstilling for kor",
  description:
    "Åpen kildekode-app for kor: planlegg og visualiser sceneoppstillinger under konserter og øvelser.",
  applicationName: "Mixup",
  appleWebApp: { capable: true, title: "Mixup", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className="h-full antialiased">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
