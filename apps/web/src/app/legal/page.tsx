import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/support-contact";

const DOCS = [
  {
    href: "/legal/privacy",
    title: "Политика обработки персональных данных",
    description: "Цели и категории обработки ПД, права субъекта, cookies.",
  },
  {
    href: "/legal/confidentiality",
    title: "Положение о конфиденциальности персональных данных",
    description: "Состав данных, хранение, передача третьим лицам.",
  },
  {
    href: "/legal/terms",
    title: "Пользовательское соглашение",
    description: "Правила использования сервиса и AI-наставника.",
  },
  {
    href: "/legal/offer",
    title: "Публичная оферта",
    description: "Условия оказания услуг, тарифы, оплата и возврат.",
  },
] as const;

export default function LegalHubPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-5 py-12 md:px-8">
      <SectionLabel>Юридическая информация</SectionLabel>
      <div className="space-y-2">
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-[var(--text-primary)]">
          Документы
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Поддержка:{" "}
          <Link
            href="/support"
            className="text-[#6D5DF6] underline decoration-black/15 underline-offset-2 hover:text-[#5D4DE6]"
          >
            страница поддержки
          </Link>
          {" · "}
          <a
            href={supportMailtoHref()}
            className="text-[#6D5DF6] underline decoration-black/15 underline-offset-2 hover:text-[#5D4DE6]"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {DOCS.map((doc) => (
          <li key={doc.href}>
            <Link href={doc.href}>
              <Card className="group p-6 transition-colors hover:border-[#6D5DF6]/30">
                <h2 className="font-medium text-[var(--text-primary)] group-hover:text-[#6D5DF6]">
                  {doc.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{doc.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/">
        <Button variant="secondary">На главную</Button>
      </Link>
    </main>
  );
}
