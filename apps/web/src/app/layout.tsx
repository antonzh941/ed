import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Сократ — AI-помощник для подготовки к ЕГЭ и ОГЭ",
  description:
    "Сократ: спокойная подготовка к ЕГЭ и ОГЭ с AI — кабинет, учебный workspace и мягкое сопровождение как у наставника. sokratai.ru",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--bg-base)] text-[var(--text-primary)]">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
