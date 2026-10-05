# Nova CRM connectors

Однонаправленный сервис синхронизации источников данных с Nova CRM (Twenty). Все внешние
источники открываются только для чтения; запись выполняется исключительно через публичный REST и
metadata API Nova CRM. Сервис не зависит от Nx и рассчитан на Node.js 24.

## Быстрый старт

```bash
cd nova/connectors
npm ci
cp .env.example .env
npm run bootstrap
npm run sync -- apaleo --dry-run
npm start
```

`npm run bootstrap` идемпотентно добавляет объекты Property, Stay, Payment, Review, Conversation,
WebStat и SyncRun, их связи и поля `externalSource`/`externalId` на стандартные Person, Company,
Note и Task. Повторный запуск выводит `{"createdObjects":0,"createdFields":0}`.

CLI:

```bash
npm run sync -- <apaleo|welcome|hotel-anna|review-monitor|stripe|nova-beds> [--full] [--dry-run]
npm run migrate:legacy
```

Инкрементальный курсор хранится в SyncRun. `--full` его игнорирует, `--dry-run` не требует ключа
Nova CRM и печатает записи. Для полностью офлайн-прогона задайте
`CONNECTOR_FIXTURE_DIR=$PWD/fixtures`; тогда `apaleo.json` используется вместо API.

## Переменные и ключи

Полный список находится в `.env.example`; файл `.env` не коммитится.

- `NOVA_CRM_URL`, `NOVA_CRM_API_KEY`: URL и API key workspace из Settings → Developers → API
  keys. Ключу нужны права на data model для bootstrap и на записи объектов для sync.
- `APALEO_CLIENT_ID`, `APALEO_CLIENT_SECRET`: OAuth client credentials приложения Apaleo с
  read scopes inventory, booking и folio. POST применяется только к OAuth token endpoint.
- `WELCOME_SUPABASE_URL`, `WELCOME_SUPABASE_KEY`: отдельный JWT/ключ роли только для SELECT.
  Нельзя использовать service role в контейнере.
- `LEGACY_CRM_DATABASE_URL`: пользователь PostgreSQL только с CONNECT/SELECT. Миграция запускается
  вручную один раз; соединение дополнительно начинает `BEGIN READ ONLY`.
- `HOTEL_ANNA_DATABASE_PATH`, `REVIEW_MONITOR_DATABASE_PATH`, `NOVA_BEDS_DATABASE_PATH`: пути к
  SQLite. Файлы открываются через Node SQLite с `readOnly: true`, а compose монтирует каталоги `:ro`.
- `STRIPE_READ_KEY`: restricted key с единственным разрешением `Charges: Read`; коннектор по
  умолчанию выключен.

Read-only роль Welcome создаёт владелец БД (не сервис):

```sql
create role nova_connectors_readonly nologin;
grant usage on schema insights, controlling to nova_connectors_readonly;
grant select on all tables in schema insights, controlling to nova_connectors_readonly;
alter default privileges in schema insights grant select on tables to nova_connectors_readonly;
alter default privileges in schema controlling grant select on tables to nova_connectors_readonly;
-- Выпустить для роли отдельный JWT через принятый в проекте Supabase-процесс.
```

Код имеет явный allowlist таблиц Welcome. Схема `balter`, контактные формы и таблица `Lead` в него
не входят и никогда не запрашиваются.

## Расписания

Каждый период задаётся стандартным cron-выражением `CONNECTOR_<NAME>_CRON`, включение — строгим
`CONNECTOR_<NAME>_ENABLED=true`. Дефисы заменяются подчёркиваниями, например
`CONNECTOR_HOTEL_ANNA_CRON`. Значения по умолчанию приведены в `.env.example`. Ошибка одного job
фиксируется в его SyncRun и не останавливает другие jobs; параллельный запуск того же job
пропускается.

## Деплой

```bash
docker compose -f docker-compose.connectors.yml config
docker compose -f docker-compose.connectors.yml build
```

Сервис подключается к внешней сети `novahub` и обращается к `http://nova-crm-server:3000`. Точный каталог
SQLite review-monitor на сервере следует получить из существующего `docker inspect` и передать в
`REVIEW_MONITOR_SQLITE_DIR`; сам compose не предполагает конкретную внутреннюю раскладку проекта.
CI публикует `ghcr.io/xanymanywka-nova/nova-crm-connectors:latest` при изменениях в
`nova/connectors/**` в main.

## Интеграционная проверка без продданных

```bash
npm run fixture:hotel-anna -- /tmp/nova-hotel-fixture.db
CONNECTOR_FIXTURE_DIR=$PWD/fixtures npm run sync -- apaleo --dry-run
HOTEL_ANNA_DATABASE_PATH=/tmp/nova-hotel-fixture.db npm run sync -- hotel-anna --full
```

Фикстуры синтетические (`example.test`). Не копируйте production SQLite. После второго прогона
ожидается `created: 0`, а записи должны попасть в `skipped` или `updated` только при изменении.

## Добавление коннектора

1. Добавьте имя в `SourceName` и фабрику в `src/connectors/index.ts`.
2. Используйте `ReadOnlyHttpClient` либо `openReadOnlyDatabase`; для SQL включите транзакцию
   `READ ONLY`. Не добавляйте write-методы источника.
3. Преобразуйте строки в `SyncRecord` со стабильной парой `externalSource` + `externalId` и
   добавьте fixture mapping test.
4. Добавьте enable/cron env, документацию и при необходимости только read-only volume.
5. Запустите `npm run typecheck && npm test` и двойной fixture sync.

Person сопоставляется по нормализованному email, затем телефону E.164, затем имени и дате рождения.
Если сигналы указывают на разные записи, автоматического merge нет: создаётся задача на ручную
проверку. WebStat содержит только дневные агрегаты и не сохраняет visitor id.
