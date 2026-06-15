# `apps/web`

Основное приложение проекта и текущая launch-площадка для локального тестирования.

## Scope

- веб-MVP на `Next.js`
- подготовка к ОГЭ
- активные предметы: `russian`, `math`, `geography`, `history`
- учебный контекст: `exam + subject + taskNumber`
- backend AI-вызовы только на сервере
- Dify как основной AI/RAG backend
- локальный запуск важнее Telegram-сценария

В пользовательском интерфейсе нет отдельного поля “тема”: ученик выбирает предмет и номер задания. Dify получает тот же контракт без `topic`; старое поле `topic` в `StudySession` используется только для совместимости с текущей Prisma-схемой.

## Локальный запуск

1. Создайте `apps/web/.env.local` на основе `apps/web/.env.example`.
2. Минимум для базы:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5444/ai_tutor?schema=public
```

3. Чтобы включить реальные ответы через Dify, заполните:

```env
DIFY_API_URL=http://localhost/v1
DIFY_API_KEY=
```

4. Выполните:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

5. Откройте [http://localhost:3000](http://localhost:3000)

## Production deployment

Для self-hosted запуска подготовлен сценарий через Docker Compose:

1. Создайте `apps/web/.env` на основе `apps/web/.env.example`.
2. Заполните минимум:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/ai_tutor?schema=public
APP_BASE_URL=https://repetitoroge.ru
DIFY_API_URL=
DIFY_API_KEY=
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_RETURN_URL=https://repetitoroge.ru/pay/success
YOOKASSA_WEBHOOK_TOKEN=
```

В кабинете ЮKassa для HTTP-уведомлений укажите URL с тем же секретом, что и в `YOOKASSA_WEBHOOK_TOKEN`: `https://repetitoroge.ru/api/payments/yookassa/webhook?token=<секрет>` (это настройка у провайдера, а не отдельная переменная URL в `.env`).

3. Из корня проекта запустите:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

4. Приложение поднимется вместе с:
- `postgres`;
- отдельным контейнером `migrate`, который выполнит `prisma migrate deploy`;
- `web`;
- опционально `bot`, если нужен профиль `bot`.

5. Для запуска бота вместе с web:

```bash
docker compose -f docker-compose.prod.yml --profile bot up -d --build
```

6. Проверка доступности:

```bash
curl http://localhost:3000/api/system/status
```

Контейнер `web` уже содержит `HEALTHCHECK` по `api/system/status`.

### RAG в deploy

Production-образ не требует PDF из `docs/rag-sources/`. В Docker-образ копируется готовая папка `apps/web/data`, включая `apps/web/data/rag/rag-index.json`; сами PDF остаются локальными исходниками для пересборки индекса или загружаются в базу знаний Dify.

`npm run rag:ingest` нужен только для локального обновления `rag-index.json`. Если `docs/rag-sources/` отсутствует, команда оставит существующий индекс без изменений.

### ЮKassa и зачёт оплаты

- В [личном кабинете ЮKassa](https://yookassa.ru) укажите URL HTTP-уведомлений, например для продакшена:  
  `https://repetitoroge.ru/api/payments/yookassa/webhook?token=<секрет>` (метод `POST`, события `payment.succeeded`). Для другого домена замените хост на свой. Значение `<секрет>` должно совпадать с `YOOKASSA_WEBHOOK_TOKEN` в `.env`.  
  После успешной оплаты купленные советы Сократа начисляются в `PostgreSQL` (идемпотентно по id платежа).  
- Webhook дополнительно пропускает только официальные IP-адреса ЮKassa. Если приложение стоит за Nginx, Cloudflare или другим proxy, прокиньте реальный адрес клиента в `X-Real-IP` или `X-Forwarded-For` и не разрешайте внешним клиентам подделывать эти заголовки. В production желательно продублировать allowlist на reverse proxy/firewall, чтобы лишние запросы не доходили до Node.
- Для локальной проверки webhook можно временно задать `YOOKASSA_WEBHOOK_IP_ALLOWLIST_DISABLED=true`; в production этот флаг не включайте.
- Дополнительно return-flow вызывает `POST /api/payments/yookassa/sync` со страницы `/pay/success`, если webhook ещё не обработан.

### Пароль Postgres в Docker

В каталоге с `docker-compose.prod.yml` задайте переменные (или положите их в `.env` рядом с compose), чтобы они совпадали с `POSTGRES_*` в сервисе `postgres` и с подставляемой в compose строкой `DATABASE_URL`:  
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. В сложных паролях укажите `DATABASE_URL` вручную в `apps/web/.env` с URL-кодированием.

### Необязательные флаги

- `REQUIRE_STARTER_ENTITLEMENT_FOR_AI=true` — Dify-сценарии только для пользователей с положительным балансом советов Сократа в БД.
- `EXPOSE_STATUS_DEBUG=true` в production — вернуть в `/api/system/status` поле `missingEnv` и текст ошибки БД (по умолчанию в production скрыто).
- `DISABLE_AI_RATE_LIMIT=true` — отключить лимит 50 запросов/мин/ IP на маршрутах `/api/ai/*`.

## Что тестировать локально

- генерацию задания по выбранному предмету и номеру
- объяснение задания
- режим Сократа
- переключение между `russian`, `math`, `geography`, `history`
- статус AI, базы и локального RAG-индекса в интерфейсе
- сохранение прогресса в `PostgreSQL`, если задан `DATABASE_URL`

## Полезные команды

```bash
npm run dev
npm run build
npm run lint
npm run rag:ingest
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Telegram

Telegram miniapp остаётся дополнительным клиентом. Для локального web-тестирования он не обязателен.
