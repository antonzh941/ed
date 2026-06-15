import { readFile } from "fs/promises";
import path from "path";
import type { ReactNode } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

type LegalDocumentViewProps = {
  sectionLabel?: string;
  title: string;
  fileName: string;
};

function siteOrigin(): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  return base || "https://repetitoroge.ru";
}

function normalizeLegalText(raw: string): string {
  const origin = siteOrigin();
  return raw
    .replaceAll("[URL сайта]", origin)
    .replaceAll("[email поддержки]", SUPPORT_EMAIL)
    .replaceAll("[email]", SUPPORT_EMAIL)
    .replaceAll("[whzhukov941@gmail.com поддержки]", SUPPORT_EMAIL);
}

function safeHttpUrl(raw: string): string | null {
  if (!/^https?:\/\//i.test(raw)) {
    return null;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

function linkifyLine(line: string): ReactNode {
  const segments = line.split(/(https?:\/\/[^\s\[\]<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi);
  return segments.map((part, i) => {
    const href = safeHttpUrl(part);
    if (href) {
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#6D5DF6] underline decoration-black/15 underline-offset-2 hover:text-[#5D4DE6]"
        >
          {part}
        </a>
      );
    }
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(part)) {
      return (
        <a
          key={i}
          href={`mailto:${part}`}
          className="text-[#6D5DF6] underline decoration-black/15 underline-offset-2 hover:text-[#5D4DE6]"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export async function LegalDocumentView({
  sectionLabel = "Юридическая информация",
  title,
  fileName,
}: LegalDocumentViewProps) {
  const fullPath = path.join(process.cwd(), "content", "legal", fileName);
  const raw = await readFile(fullPath, "utf-8");
  const text = normalizeLegalText(raw);
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-12 md:px-8">
      <SectionLabel>{sectionLabel}</SectionLabel>
      <h1 className="font-serif text-3xl tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
        {title}
      </h1>
      <Card className="p-6 text-sm leading-7 text-[var(--text-secondary)] sm:p-8">
        <div className="space-y-3">
          {lines.map((line, i) =>
            line.length > 0 ? (
              <p key={i} className="hyphens-auto text-pretty">
                {linkifyLine(line)}
              </p>
            ) : null,
          )}
        </div>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Link href="/legal">
          <Button variant="secondary">Все документы</Button>
        </Link>
        <Link href="/">
          <Button variant="secondary">На главную</Button>
        </Link>
      </div>
    </main>
  );
}
