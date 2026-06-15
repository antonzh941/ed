# AI Tutor OGE

Веб-MVP AI-репетитора по ОГЭ. Активная launch-площадка — `apps/web`, предметы: `russian`, `math`, `geography`, `history`.

## Статус проекта

Проект в стадии MVP. Учебный контур: выбор предмета и номера задания → генерация → разбор → режим Сократа → сохранение прогресса.

## Что уже есть

- `Next.js` веб-интерфейс (`apps/web`)
- генерация задания по `exam + subject + taskNumber`
- объяснение задания
- пошаговый режим Сократа
- интеграция с self-hosted `Dify` (AI/RAG backend)
- готовый локальный `RAG`-индекс в `apps/web/data/rag/rag-index.json`
- ingest-скрипт для локальной пересборки индекса из PDF
- `Prisma + PostgreSQL` для профиля, прогресса и учебных сессий
- авторизация через VK ID / Yandex; VK OneTap через `@vkid/sdk`

Важно: продуктовый и AI-контракт строится вокруг `exam + subject + taskNumber`. Свободное поле “тема” не используется в интерфейсе и не передаётся в Dify; старое поле `topic` в БД остаётся только как техническая совместимость текущей схемы.

## Как это работает (в проде)

- **Web**: `apps/web` (Next.js App Router).
- **Auth**: серверная сессия в `httpOnly` cookie (`/api/auth/session`), вход через VK ID / Yandex.
- **Кабинет / прогресс**: источник истины — **PostgreSQL**, кабинет отдаётся из `/api/dashboard/summary`.
- **AI**: web вызывает `/api/ai/*`, сервер ходит в **Dify** по `DIFY_API_URL` + `DIFY_API_KEY` (секреты на клиент не уходят).
- **RAG**: локальный индекс `apps/web/data/rag/rag-index.json` деплоится вместе с web; основные AI/RAG сценарии живут в Dify.

## Что уже закрыто

- локальный `web`-MVP в `apps/web`
- 4 активных предмета: `russian`, `math`, `geography`, `history`
- учебный flow: генерация, объяснение, режим Сократа
- ручной прогон всех 4 предметов: генерация, объяснение, режим Сократа, сохранение прогресса
- backend-интеграция с `Dify`
- `RAG`-контур: Dify как основной AI/RAG backend и готовый локальный индекс для статуса/контекста
- хранение профиля, прогресса и учебных сессий через `Prisma + PostgreSQL`

## Что делаем сейчас

1. Проверяем качество сценариев в Dify и дорабатываем workflow там, где ответы слабые.
2. Проверяем качество `RAG` в Dify: помогает ли контекст по предмету и номеру задания, не шумит ли выдача.
3. Проверяем, что профиль, сессии и сообщения корректно сохраняются в `PostgreSQL`.
4. Собираем список точечных улучшений по UX, текстам и учебным сценариям после ручного прогона.

## Что делаем потом

- улучшение UX и текстов
- дизайн и бренд-стиль
- юридические документы
- production-деплой и домен

## Что пока не в приоритете

- Telegram miniapp как основной launch-сценарий
- новые платформы вне `apps/web`
- расширение scope за пределы текущего MVP до стабилизации локального web-продукта

## Быстрый старт

1. Установите зависимости:

```bash
npm install
```

2. Создайте `apps/web/.env.local` на основе `apps/web/.env.example`.

3. Для локального запуска минимум нужен `DATABASE_URL`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5444/ai_tutor?schema=public
```

4. Чтобы включить AI-ответы через Dify, заполните:

```env
DIFY_API_URL=http://localhost/v1
DIFY_API_KEY=
```

5. При первом подключении базы выполните:

```bash
npm run prisma:generate
npm run prisma:migrate
```

6. Запустите проект:

```bash
npm run dev
```

7. Откройте [http://localhost:3000](http://localhost:3000)

## Deploy-ready статус

Сейчас проект уже подготовлен к self-hosted деплою через Docker:

- production compose: `docker-compose.prod.yml`
- web image: `apps/web/Dockerfile.web`
- migration job: `apps/web/Dockerfile.migrate`
- healthcheck для web через `api/system/status`
- отдельный redirect-flow оплаты через `ЮKassa`

## Production деплой на домен (Ubuntu + Docker + nginx)

Схема деплоя, которая избегает конфликтов портов:

- системный `nginx` слушает **80/443** и проксирует домен на web (`127.0.0.1:3000`);
- Dify развёрнут отдельным docker-compose (отдельный стек, своя сеть `docker_default`);
- web подключён к `docker_default` (как external network) и ходит в Dify по `http://docker-api-1:5001/v1`;
- наружу не публикуем API Dify — пользователи ходят только на домен web.

### 1) Сервер: код

```bash
cd /var/www
git clone https://github.com/whzhukov941-blip/sokrat.git sokrat-main
cd /var/www/sokrat-main
```

Обновление:

```bash
cd /var/www/sokrat-main
git pull
```

### 2) Сервер: env

1. Создайте `apps/web/.env` на основе `apps/web/.env.example`.
2. Укажите production-значения для:

```env
APP_BASE_URL=https://repetitoroge.ru
YOOKASSA_RETURN_URL=https://repetitoroge.ru/pay/success
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/ai_tutor?schema=public
# Dify (внутри docker-сети)
DIFY_API_URL=http://docker-api-1:5001/v1
DIFY_API_KEY=...

# Auth cookie secret (обязательно в production)
AUTH_COOKIE_SECRET=... (32+ символов)

# VK ID
VK_CLIENT_ID=...
VK_CLIENT_SECRET=...
VK_REDIRECT_URI=https://repetitoroge.ru/
```

Важно: `apps/web/.env` нельзя коммитить (секреты). Он должен существовать только на сервере.

В ЮKassa в настройках HTTP-уведомлений укажите: `https://repetitoroge.ru/api/payments/yookassa/webhook`.

### 3) Docker: поднять web + postgres

```bash
cd /var/www/sokrat-main
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
```

Health:

```bash
curl http://127.0.0.1:3000/api/system/status
```

### 4) nginx: проксировать домен на web

Убедитесь, что nginx проксирует `repetitoroge.ru` на `http://127.0.0.1:3000`.

### 5) Dify: типовые ошибки

- Если Dify возвращает `503 Service is too busy`, это перегруз/лимиты LLM-провайдера внутри Dify — переключите модель/провайдера или проверьте квоты.
- Если AI не работает, первым делом проверьте `DIFY_API_URL` и что контейнер web в сети `docker_default`:

```bash
docker inspect oge-drive-web --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

## Локальные режимы

- Без `DIFY_API_URL` и `DIFY_API_KEY` AI-сценарии недоступны.
- С `DIFY_API_URL` и `DIFY_API_KEY` включаются ответы через backend.
- Без `DATABASE_URL` профиль и прогресс живут локально в браузере.
- С `DATABASE_URL` включается сохранение профиля, прогресса и учебных сессий в PostgreSQL.

## Команды

Из корня проекта:

```bash
npm run dev
npm run lint
npm run rag:ingest
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## RAG

Официальный deploy-сценарий: PDF из `docs/rag-sources/` не возвращаем и не кладём в production-образ. Приложение деплоится с готовым индексом `apps/web/data/rag/rag-index.json`, а основной AI/RAG backend — Dify.

`docs/rag-sources/` — только локальная рабочая папка для пересборки индекса из официальных PDF. Она может отсутствовать в репозитории и на сервере. Если PDF отсутствуют, `npm run rag:ingest` не затирает существующий `rag-index.json`.

RAG-контекст в локальном индексе подбирается по экзамену, предмету и номеру задания. Метаданные `topic` внутри сгенерированного индекса могут встречаться как технический label источника, но не являются пользовательским полем сценария.

Рекомендуемые локальные исходники для пересборки индекса:

- `docs/rag-sources/fipi-oge-russian-2025-demo.pdf`
- `docs/rag-sources/fipi-oge-math-2025-demo.pdf`
- `docs/rag-sources/fipi-oge-geo-2025-demo.pdf`
- `docs/rag-sources/fipi-oge-hist-2025-demo.pdf`

После локального обновления PDF запустите:

```bash
npm run rag:ingest
```

Индекс будет записан в `apps/web/data/rag/rag-index.json`; именно этот файл должен попадать в deploy.

## Telegram

Telegram miniapp и bot flow пока не являются активным launch-scope. Они остаются опциональными сценариями на будущее, поэтому для локального веб-тестирования `TELEGRAM_BOT_TOKEN` не нужен.

Если всё же хотите проверить Telegram-часть локально:

```bash
npm --prefix apps/web run telegram:bot
```

## Что ещё понадобится потом

- актуальные `DIFY_API_URL` и `DIFY_API_KEY`
- рабочий `DATABASE_URL`
- актуальный `rag-index.json` и настроенная база знаний в Dify
- дизайн и бренд-стиль
- юридические документы
- решение по тарифам и оплате
- production-деплой и домен
