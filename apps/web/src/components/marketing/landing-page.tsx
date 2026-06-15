"use client";

import Link from "next/link";
import { Award, BookOpen, Clock, Sparkles, Target, TrendingUp, Zap } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-semibold text-[#111111]">ИзиОГЭ</span>
            </div>
            <nav className="hidden items-center gap-8 md:flex">
              <a href="#features" className="text-[#6B7280] transition-colors hover:text-[#111111]">
                О нас
              </a>
              <a href="#pricing" className="text-[#6B7280] transition-colors hover:text-[#111111]">
                Тарифы
              </a>
              <a href="#testimonials" className="text-[#6B7280] transition-colors hover:text-[#111111]">
                Отзывы
              </a>
            </nav>
            <Link
              href="/login"
              className="rounded-2xl bg-[#6D5DF6] px-6 py-2.5 !text-white transition-all hover:scale-105 hover:bg-[#5D4DE6]"
            >
              Войти
            </Link>
          </div>
        </div>
      </header>

      <section className="px-4 pb-32 pt-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-2">
                <div className="h-2 w-2 rounded-full bg-[#22C55E]" />
                <span className="text-sm text-[#6B7280]">ИИ-репетитор доступен 24/7</span>
              </div>

              <h1 className="text-5xl font-bold leading-tight text-[#111111] md:text-6xl lg:text-7xl">
                Подготовка к ОГЭ без стресса
              </h1>

              <p className="text-xl leading-relaxed text-[#6B7280]">
                Персональный ИИ-наставник, который объясняет материал понятно, мотивирует и помогает получить высокий балл
              </p>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/app"
                  className="rounded-[28px] bg-[#6D5DF6] px-8 py-4 text-center font-medium !text-white transition-all hover:scale-105 hover:bg-[#5D4DE6] hover:shadow-2xl hover:shadow-purple-500/20"
                >
                  Начать бесплатно
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-[32px] border border-black/5 bg-white p-8 shadow-2xl shadow-black/5">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                        <Target className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-[#111111]">Математика</div>
                        <div className="text-sm text-[#6B7280]">Задание 21</div>
                      </div>
                    </div>
                    <div className="rounded-full bg-[#22C55E]/10 px-4 py-1.5 text-sm font-medium text-[#22C55E]">
                      85% прогресс
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl bg-[#F8F7F4] p-6">
                    <div className="text-sm text-[#6B7280]">ИИ-наставник объясняет:</div>
                    <div className="text-[#111111]">
                      Давай разберём эту задачу шаг за шагом. Сначала найдём общий множитель...
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Решено", value: "127" },
                      { label: "Серия", value: "5 дней" },
                      { label: "XP", value: "2,450" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-[#F8F7F4] p-4 text-center">
                        <div className="text-2xl font-bold text-[#111111]">{stat.value}</div>
                        <div className="mt-1 text-sm text-[#6B7280]">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="absolute -right-6 -top-6 rounded-2xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-[#6D5DF6]" />
                  <div>
                    <div className="font-semibold text-[#111111]">+50 XP</div>
                    <div className="text-sm text-[#6B7280]">Отлично!</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-[#111111] md:text-5xl">
              Всё для успешной подготовки
            </h2>
            <p className="text-xl text-[#6B7280]">Современные технологии и проверенные методики</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <Sparkles className="h-6 w-6" />,
                title: "ИИ-репетитор",
                description: "Персональный наставник объясняет материал так, как удобно именно тебе",
                color: "from-[#6D5DF6] to-[#8B5CF6]",
              },
              {
                icon: <Target className="h-6 w-6" />,
                title: "Адаптивная программа",
                description: "Подбираем задания под твой уровень и автоматически усложняем",
                color: "from-[#8B5CF6] to-[#6D5DF6]",
              },
              {
                icon: <TrendingUp className="h-6 w-6" />,
                title: "Отслеживание прогресса",
                description: "Видишь свой рост в реальном времени и мотивируешься на большее",
                color: "from-[#22C55E] to-[#16A34A]",
              },
              {
                icon: <Zap className="h-6 w-6" />,
                title: "Геймификация",
                description: "Получай XP, открывай достижения и соревнуйся с друзьями",
                color: "from-[#6D5DF6] to-[#8B5CF6]",
              },
              {
                icon: <Clock className="h-6 w-6" />,
                title: "Гибкий график",
                description: "Занимайся когда удобно — платформа доступна 24/7",
                color: "from-[#8B5CF6] to-[#6D5DF6]",
              },
              {
                icon: <BookOpen className="h-6 w-6" />,
                title: "4 предмета",
                description: "Математика, русский, география и история в одном месте",
                color: "from-[#22C55E] to-[#16A34A]",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="rounded-[28px] border border-black/5 bg-white p-8 shadow-lg shadow-black/5 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/10"
              >
                <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.color} text-white`}>
                  {feature.icon}
                </div>
                <h3 className="mb-3 text-xl font-semibold text-[#111111]">{feature.title}</h3>
                <p className="leading-relaxed text-[#6B7280]">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-[#111111] md:text-5xl">
              Выбери свой тариф
            </h2>
            <p className="text-xl text-[#6B7280]">
              Начни бесплатно или выбери план с полным доступом
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: "Тест-драйв",
                price: "0₽",
                subtitle: "10 советов",
                features: ["Бесплатная проба", "Метод Сократа", "Базовая статистика"],
                cta: "Попробовать",
                popular: false,
              },
              {
                name: "На пробу",
                price: "259₽",
                subtitle: "40 советов",
                features: ["Короткий пакет", "Проверка формата", "ИИ-репетитор"],
                cta: "Выбрать",
                popular: false,
              },
              {
                name: "Один предмет",
                price: "767₽",
                subtitle: "150 советов",
                features: ["Регулярная подготовка", "Один предмет", "Приоритетная поддержка"],
                cta: "Выбрать",
                popular: true,
              },
              {
                name: "Майский марафон",
                price: "1287₽",
                subtitle: "300 советов",
                features: ["Интенсивная подготовка", "Перед экзаменом", "Персональный куратор"],
                cta: "Выбрать",
                popular: false,
              },
            ].map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-[28px] bg-[#F8F7F4] p-8 ${
                  plan.popular ? "shadow-2xl shadow-purple-500/20 ring-2 ring-[#6D5DF6]" : ""
                }`}
              >
                {plan.popular ? (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#6D5DF6] px-4 py-1.5 text-sm font-medium text-white">
                    Популярный
                  </div>
                ) : null}
                <div className="mb-6">
                  <h3 className="mb-2 text-xl font-semibold text-[#111111]">{plan.name}</h3>
                  <div className="mb-1 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#111111]">{plan.price}</span>
                  </div>
                  <p className="text-[#6B7280]">{plan.subtitle}</p>
                </div>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-[#6B7280]">
                      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#22C55E]/20">
                        <div className="h-2 w-2 rounded-full bg-[#22C55E]" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`block w-full rounded-2xl px-6 py-3 text-center font-medium transition-all hover:scale-105 ${
                    plan.popular
                      ? "bg-[#6D5DF6] text-white shadow-lg shadow-purple-500/20 hover:bg-[#5D4DE6]"
                      : "border border-black/5 bg-white text-[#111111] hover:bg-gray-50"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[32px] bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6] p-12 text-center shadow-2xl shadow-purple-500/20 md:p-16">
            <h2 className="mb-6 text-4xl font-bold text-white md:text-5xl">
              Начни готовиться уже сегодня
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-xl text-white/90">
              Попробуй 3 дня бесплатно. Без карты. Без обязательств.
            </p>
            <Link
              href="/app"
              className="inline-block rounded-[28px] bg-white px-10 py-4 font-semibold text-[#6D5DF6] shadow-xl transition-all hover:scale-105 hover:shadow-2xl"
            >
              Начать бесплатно
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6D5DF6] to-[#8B5CF6]">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-semibold text-[#111111]">ИзиОГЭ</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <Link
                href="/support"
                className="cursor-pointer text-[#6B7280] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#111111] hover:decoration-black/20"
              >
                Поддержка
              </Link>
              <Link href="/legal" className="text-[#6B7280] transition-colors hover:text-[#111111]">
                Документы
              </Link>
            </div>

            <p className="text-[#6B7280]">&copy; 2026 ИзиОГЭ</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
