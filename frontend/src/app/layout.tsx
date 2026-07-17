import type { Metadata } from "next";
import { Inter, Besley, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const besley = Besley({
  variable: "--font-besley",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  variable: "--font-noto-nastaliq",
  subsets: ["arabic"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Jadeed Kashtkar — جدید کاشتکار",
  description: "Satellite farming intelligence for Pakistani farmers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${besley.variable} ${notoNastaliqUrdu.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before paint so a returning visitor's stored theme applies
            immediately — see lib/theme.ts. suppressHydrationWarning on <html>
            is scoped to the data-theme attribute this sets, which SSR can't
            know in advance. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
