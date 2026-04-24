import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "comux",
  description: "AI-Ops Development Platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "comux",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
