import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Add surface textures to 3D models in your browser. Load an STL, preview it in 3D and prepare textured meshes for 3D printing. Files never leave your device.";

// Page title, description and social/SEO tags for the editor.
export const metadata: Metadata = {
  title: {
    default: "3D Texture Studio | Surface Textures for 3D Printing",
    template: "%s | 3D Texture Studio",
  },
  description,
  applicationName: "3D Texture Studio",
  keywords: [
    "3D printing",
    "STL texture",
    "surface texture",
    "displacement map",
    "STL viewer",
    "3D model editor",
    "knurling",
    "bump map",
  ],
  category: "technology",
  openGraph: {
    type: "website",
    title: "3D Texture Studio",
    description,
    siteName: "3D Texture Studio",
  },
  twitter: {
    card: "summary",
    title: "3D Texture Studio",
    description,
  },
  robots: { index: true, follow: true },
};

// Browser UI colour and mobile scaling.
export const viewport: Viewport = {
  themeColor: "#4338ca",
  width: "device-width",
  initialScale: 1,
};

const themeScript = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

// Root HTML shell: fonts, global styles and page body.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint to avoid a light/dark flash. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script, no user input
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
