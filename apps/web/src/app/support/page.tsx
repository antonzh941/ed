import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/support-contact";

export default function SupportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-8 px-5 py-12 md:px-8">
      <SectionLabel>Помощь</SectionLabel>
      <div className="space-y-2">
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-[var(--text-primary)]">
          Поддержка
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Напишите нам на почту — ответим в рабочее время. Если кнопка «Открыть почту» не срабатывает,
          скопируйте адрес вручную. Удаление аккаунта и данных в сервисе можно выполнить в личном кабинете
          после входа (раздел внизу страницы кабинета).
        </p>
      </div>

      <Card className="space-y-6 p-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Электронная почта
          </p>
          <p className="mt-2 select-all font-mono text-base text-[var(--text-primary)]">
            {SUPPORT_EMAIL}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={supportMailtoHref()}
            className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-[#6D5DF6] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition hover:bg-[#5D4DE6]"
          >
            Открыть почту
          </a>
          <Link href="/legal" className="inline-flex items-center justify-center">
            <Button variant="secondary" className="w-full sm:w-auto">
              Документы
            </Button>
          </Link>
        </div>
      </Card>

      <Link href="/">
        <Button variant="secondary">На главную</Button>
      </Link>
    </main>
  );
}
