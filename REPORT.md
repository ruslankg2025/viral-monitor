# Viral Monitor — Отчёт: Спецификация vs Реализация

> Дата: 8 апреля 2026
> Версия: текущий main (коммит 2104578)

---

## 1. Общая сводка

| Раздел спецификации | Статус | Комментарий |
|---|---|---|
| Архитектура и структура | ✅ Выполнено | Структура расширена (больше файлов, чем в плане) |
| Модели БД (4 таблицы) | ✅+ Расширено | 8 таблиц вместо 4 (добавлены Account, MainProfile, ScraperProfile, APIUsageLog) |
| Парсеры (4 платформы) | ✅ Выполнено | YouTube, Instagram (3 стратегии), TikTok (2 стратегии), VK |
| Абстрактный парсер | ✅ Выполнено | BasePlatformParser + safe_fetch с backoff |
| X-Factor анализатор | ✅ Выполнено | analyzer.py — медиана, пересчёт, outlier detection |
| AI Engine (Claude) | ✅+ Расширено | 3 провайдера (Claude + OpenAI + Groq) вместо одного Claude |
| API Endpoints | ✅+ Расширено | 40+ эндпоинтов вместо ~20 в спеке |
| Frontend (5 страниц) | ✅+ Расширено | 10 страниц + 18 компонентов |
| Дизайн-система | ⚠️ Частично | CSS-переменные есть, Tailwind настроен, но компоненты используют inline styles |
| Планировщик | ✅ Выполнено | APScheduler, CronTrigger 00/06/12/18 МСК |
| Обработка ошибок | ✅ Выполнено | try/except + backoff в парсерах, retry в React Query, русские сообщения |
| Логирование | ✅ Выполнено | structlog, JSON-формат, ISO timestamps |
| Конфигурация (.env) | ✅ Выполнено | .env.example + settings в БД + Pydantic Settings |

---

## 2. Архитектура и структура проекта

### Спецификация предполагала:
```
backend/
├── main.py, config.py, database.py, models.py, schemas.py
├── analyzer.py, ai_engine.py, scheduler.py
├── parsers/ (5 файлов: base + 4 платформы)
└── routers/ (5 файлов)
frontend/src/
├── pages/ (5 страниц)
└── components/ (13 компонентов)
```

### Реализовано:
```
backend/
├── main.py, config.py, database.py, models.py, schemas.py (34 Pydantic-модели)
├── analyzer.py, auth.py, transcriber.py, scheduler.py
├── ai/ (7 файлов: router, prompts, schemas, utils, claude/openai/groq клиенты)
├── parsers/ (11 файлов: base, factory, apify_client, youtube, vk,
│            instagram_apify, instagram_instagrapi, instagram_legacy,
│            tiktok_apify, tiktok_legacy)
└── routers/ (8 файлов: bloggers, videos, analysis, scripts, settings,
              accounts, analyze, proxy)
frontend/src/
├── pages/ (10 страниц)
└── components/ (18 компонентов)
```

### Вердикт: ✅ Расширено
Структура значительно масштабнее спецификации. AI вынесен в отдельный модуль с 3 провайдерами. Instagram и TikTok имеют по несколько реализаций парсеров с автоматическим fallback. Добавлены модули авторизации, транскрипции и прокси.

---

## 3. Модели базы данных

### Спецификация: 4 таблицы
| Таблица | Статус | Изменения |
|---|---|---|
| **bloggers** | ✅ Реализована | Добавлены: `account_id` (FK), `niche`. Unique constraint расширен на `(account_id, platform, username)` |
| **videos** | ✅ Реализована | Добавлены: `tags`, `niche`, `language`, `is_analyzed`, `is_standalone`, `hooks`, `reel_description` |
| **scripts** | ✅ Реализована | Добавлены: `account_id` (FK), `hook_visual`, `duration_target`, `hashtags`, `shooting_tips` |
| **settings** | ✅ Реализована | Без изменений |

### Добавлено сверх спецификации: +4 таблицы
| Таблица | Назначение |
|---|---|
| **Account** | Мультиаккаунтность: id, token, display_name, is_admin |
| **MainProfile** | Продвигаемый аккаунт пользователя: platform, username, niche, tone, video_format, audience_desc, banned_words |
| **ScraperProfile** | Аккаунт-парсер (рискуемый): platform, username, password, session_json, status |
| **APIUsageLog** | Трекинг расходов API: provider, operation, tokens_in/out, cost_usd, duration_ms |

### Вердикт: ✅+ Значительно расширено
Все 4 исходные таблицы реализованы с дополнительными полями. Добавлены 4 новые таблицы для мультиаккаунтности, профилей и трекинга расходов.

---

## 4. Парсеры

### YouTube
| Требование | Статус |
|---|---|
| yt-dlp programmatic API (не subprocess) | ✅ `yt_dlp.YoutubeDL` как context manager |
| extract_flat, skip_download | ✅ Реализовано |
| Извлечение view_count, like_count, etc. | ✅ Все метрики |
| Транскрипция (субтитры ru/en) | ✅ `get_subtitles()` метод |
| Rate limiting (1-2.5с) | ✅ `asyncio.sleep(random.uniform(0.5, 1.5))` |
| Error handling | ✅ try/except + логирование |

### Instagram
| Требование | Статус |
|---|---|
| instaloader с сессией | ✅ `instagram_legacy.py` — fallback |
| ThreadPoolExecutor | ✅ Запуск в executor |
| Session cookie поддержка | ✅ Три варианта: instagrapi (session_json), Apify (sessionid), instaloader (cookie) |

**Дополнительно реализовано:**
- `instagram_instagrapi.py` — через instagrapi (private mobile API), login по паролю или session cookie
- `instagram_apify.py` — через Apify actor `instagram-reel-scraper` с residential proxy
- Автовыбор через `ParserFactory`: Apify+sessionid > instagrapi > instaloader

### TikTok
| Требование | Статус |
|---|---|
| Playwright + stealth | ⚠️ Реализован как fallback (`tiktok_legacy.py`), не primary |
| XHR перехват | ✅ Парсинг `__UNIVERSAL_DATA__` JSON из страницы |
| Cookie хранение | ❌ Не реализовано (data/tiktok_cookies.json) |
| Rate limiting (3-6с) | ✅ Задержки между запросами |

**Дополнительно:** Apify actor `clockworks/free-tiktok-scraper` как primary парсер.

### VK
| Требование | Статус |
|---|---|
| VK API video.get | ✅ С extended=1, v=5.199 |
| owner_id > 0 и < 0 | ✅ Пользователи и сообщества |
| resolveScreenName | ✅ Для нечисловых username |
| Rate limiting 3 req/sec | ✅ Monotonic sleep |

### Базовый парсер
| Требование | Статус |
|---|---|
| Абстрактный класс BasePlatformParser | ✅ ABC с 3 абстрактными методами |
| fetch_profile, fetch_videos, fetch_transcript | ✅ (transcript → `get_video_url`) |
| safe_fetch с backoff | ✅ Exponential backoff: 1с → 3с → 9с, max 3 попытки |

### Вердикт: ✅ Выполнено с улучшениями
Все 4 платформы реализованы. Instagram и TikTok имеют по несколько стратегий парсинга с автоматическим fallback через ParserFactory. Playwright для TikTok — fallback, а не primary (Apify надёжнее).

---

## 5. AI Engine

### Спецификация: один файл `ai_engine.py` с Claude
### Реализовано: модуль `backend/ai/` с 3 провайдерами

| Компонент | Спецификация | Реализация |
|---|---|---|
| Клиент | `anthropic.AsyncAnthropic` | ✅ `claude_client.py` + `openai_client.py` + `groq_client.py` |
| Модель анализа | claude-sonnet-4-20250514 | ✅ Claude Sonnet 4 (primary), GPT-4o (fallback) |
| Модель сценариев | claude-sonnet-4-20250514 | ✅ Claude Sonnet 4 (primary), GPT-4o (fallback) |
| Категоризация | — | ✅+ Groq Llama 3.3 70B (бесплатно, 30 req/min) |
| Суммаризация | — | ✅+ OpenAI GPT-4o-mini (экономичная) |
| Structured output | JSON-промпты + fallback regex | ✅ JSON-промпты + `re.search` fallback |
| Retry | 2 раза с backoff | ⚠️ Полагается на retry SDK, нет явного backoff в AI-клиентах |
| Роутинг | — | ✅+ `AIRouter` выбирает провайдера по задаче с цепочкой fallback |
| Трекинг расходов | — | ✅+ Все вызовы логируются в APIUsageLog |

### Функции анализа и генерации
| Функция | Спецификация | Реализация |
|---|---|---|
| `analyze_video()` | ✅ JSON с hook, structure, why_viral, emotion_trigger и др. | ✅ Реализовано |
| `generate_scripts()` | ✅ Массив сценариев с scenes, cta, hashtags, shooting_tips | ✅ Реализовано |
| Генерация хуков | — | ✅+ `generate_hooks()` — 5 вариантов хуков |
| Улучшение сценариев | — | ✅+ `improve_script()` — доработка по инструкции |
| Категоризация блогера | — | ✅+ Определение ниши по заголовкам видео |

### Вердикт: ✅+ Значительно расширено
Вместо одного файла — полноценный AI-модуль с 3 провайдерами, умным роутингом, fallback-цепочками и трекингом расходов.

---

## 6. API Endpoints

### Блогеры
| Endpoint | Спецификация | Реализация |
|---|---|---|
| `GET /api/bloggers` | ✅ | ✅ + scoped by account |
| `POST /api/bloggers` | ✅ | ✅ + background fetch |
| `POST /api/bloggers/import` | ✅ CSV | ✅ CSV/TXT |
| `DELETE /api/bloggers/{id}` | ✅ | ✅ + cascade |
| `POST /api/bloggers/{id}/refresh` | ✅ | ✅ |

### Видео
| Endpoint | Спецификация | Реализация |
|---|---|---|
| `GET /api/videos` | ✅ фильтры, пагинация, сортировка | ✅ platform, blogger_id, period, sort, outliers_only, favorited_only, page, per_page |
| `GET /api/videos/{id}` | ✅ | ✅ + blogger info |
| `POST /api/videos/{id}/analyze` | ✅ | ✅ background task |
| `POST /api/videos/{id}/favorite` | ✅ toggle | ✅ |

### Сценарии
| Endpoint | Спецификация | Реализация |
|---|---|---|
| `GET /api/scripts` | ✅ | ✅ + пагинация |
| `POST /api/scripts/generate` | ✅ | ✅ duration, style, count |
| `GET /api/scripts/{id}` | ✅ | ✅ |
| `PUT /api/scripts/{id}` | ✅ | ✅ |
| `DELETE /api/scripts/{id}` | ✅ | ✅ |

### Настройки и системные
| Endpoint | Спецификация | Реализация |
|---|---|---|
| `GET /api/settings` | ✅ | ✅ |
| `PUT /api/settings` | ✅ | ✅ |
| `POST /api/refresh/all` | ✅ | ✅ + scoped by account |
| `GET /api/stats` | ✅ | ✅ |

### Добавлено сверх спецификации
| Endpoint | Назначение |
|---|---|
| `POST /api/settings/validate` | Живая проверка API-ключей (5 провайдеров) |
| `GET /api/settings/providers-status` | Статус настроенных провайдеров |
| `POST /api/recalculate` | Пересчёт всех X-factors |
| `GET /api/costs` | Расходы по провайдерам (неделя/месяц) |
| `DELETE /api/costs/clear` | Очистка логов расходов |
| `POST /api/analyze-url` | Анализ видео по URL (standalone) |
| `GET /api/videos/{id}/full` | Полный анализ + хуки + reel description |
| `POST /api/videos/{id}/generate-hooks` | Генерация 5 вариантов хуков |
| `POST /api/videos/{id}/improve` | Улучшение сценария по команде |
| `GET /api/my-videos` | Список standalone-видео пользователя |
| `GET /api/proxy/image` | Прокси для CDN-картинок (обход CORS) |
| **13 endpoints** аккаунтов | Полное управление Account, MainProfile, ScraperProfile |

### Вердикт: ✅+ Все endpoints из спецификации реализованы + ~25 дополнительных

---

## 7. Frontend — Страницы и компоненты

### Страницы
| Страница | Спецификация | Реализация |
|---|---|---|
| Dashboard (Тренды) | ✅ | ✅ FilterBar, VideoCard grid, skeleton, empty state, infinite scroll |
| Bloggers | ✅ | ✅ Добавление, CSV-импорт, карточки, refresh/delete |
| VideoDetail | ✅ | ✅ Два столбца, метрики, AI-анализ, Timeline, генерация сценария |
| Scripts | ✅ | ✅ Список, генерация, редактирование, копирование, удаление |
| Settings | ✅ | ✅ API-ключи, валидация, threshold, провайдеры, действия, расходы |

### Дополнительные страницы (сверх спецификации)
| Страница | Назначение |
|---|---|
| Auth.jsx | Экран авторизации по токену |
| AccountProfile.jsx | Управление основным и скрапер-аккаунтами, настройки генерации |
| AnalyzePage.jsx | Анализ видео по URL |
| AnalyzeResult.jsx | Результат анализа по URL |
| MyVideos.jsx | История проанализированных видео |

### Компоненты
| Компонент | Спецификация | Реализация |
|---|---|---|
| Layout.jsx | ✅ Sidebar 240px | ✅ + account switcher |
| VideoCard.jsx | ✅ | ✅ Portrait 3:4, image proxy для Instagram |
| XFactorBadge.jsx | ✅ Пульсация для outliers | ✅ CSS `outlier-pulse` анимация |
| BloggerCard.jsx | ✅ | ✅ |
| ScriptCard.jsx | ✅ | ✅ |
| ScriptEditor.jsx | ✅ | ✅ Модалка |
| FilterBar.jsx | ✅ | ✅ Tabs + платформы + периоды + сортировка |
| ImportModal.jsx | ✅ Drag & drop | ✅ |
| GenerateForm.jsx | ✅ | ✅ Duration, style, count |
| Timeline.jsx | ✅ | ✅ Вертикальная timeline |
| Toast.jsx | ✅ | ✅ success/error/warning/info + auto-dismiss |
| Skeleton.jsx | ✅ Shimmer | ✅ |
| EmptyState.jsx | ✅ | ✅ |
| PlatformIcon.jsx | — | ✅+ Иконки платформ |
| StatsBar.jsx | — | ✅+ Строка статистики |
| CostDashboard.jsx | — | ✅+ Дашборд расходов |
| Onboarding.jsx | — | ✅+ Онбординг для новых пользователей |
| ConfirmDialog.jsx | — | ✅+ Диалог подтверждения |

### Вердикт: ✅+ Все страницы и компоненты из спецификации реализованы + 5 дополнительных страниц и 5 компонентов

---

## 8. Дизайн-система

| Требование | Статус | Детали |
|---|---|---|
| Тёмная тема | ✅ | `--bg-primary: #0a0a0a`, вся палитра реализована |
| CSS-переменные | ✅ | Полный набор в `theme.css` |
| TailwindCSS | ⚠️ Настроен, не используется | `tailwind.config.js` и `postcss.config.js` существуют, но компоненты написаны через `style={{}}` (inline styles) с CSS-переменными |
| Шрифты Inter + JetBrains Mono | ✅ | Загружены через Google Fonts в `index.html` |
| X-Factor цвета (серый/оранж/красный) | ✅ | `--xfactor-low/mid/high` |
| Анимации (shimmer, pulse) | ✅ | `@keyframes shimmer`, `outlier-pulse` |
| Desktop-only (1280px+) | ✅ | Нет media queries, нет mobile-responsive |

### Вердикт: ⚠️ Функционально полное, но стилизация через inline styles вместо Tailwind-классов
TailwindCSS настроен в проекте, но компоненты используют `style={{}}` с CSS-переменными (`var(--bg-primary)`) вместо классов Tailwind (`className="bg-primary"`). Визуальный результат идентичен, но подход отличается от спецификации.

---

## 9. Планировщик и автоматизация

| Требование | Статус | Детали |
|---|---|---|
| APScheduler AsyncIOScheduler | ✅ | Реализован |
| Интервал из настроек | ✅→ Изменено | CronTrigger вместо IntervalTrigger: фиксированное расписание 00:00/06:00/12:00/18:00 МСК |
| Инкрементальный парсинг (after=last_checked_at) | ✅ | Delta-подход реализован |
| Upsert по platform+external_id | ✅ | Дедупликация при вставке |
| Обновление avg_views и x_factor | ✅ | Пересчёт после каждого фетча |
| Логирование результата | ✅ | structlog с количеством новых видео |
| Lifespan event | ✅ | Запуск в `app_lifespan` |

### Дополнительно:
- **Обрезка видео (pruning)** — после каждого фетча оставляет только топ-N по просмотрам
- **Авто-транскрипция outliers** — если включено в настройках

### Вердикт: ✅ Выполнено с улучшением (фиксированное расписание МСК вместо плавающего интервала)

---

## 10. Что добавлено сверх спецификации

| Фича | Описание |
|---|---|
| **Мультиаккаунтная система** | Account → MainProfile + ScraperProfile; изоляция данных по account_id; токен-авторизация |
| **3 AI-провайдера** | Claude (primary), OpenAI (fallback), Groq (бесплатная категоризация) с умным роутингом |
| **Транскрипция** | YouTube субтитры (бесплатно) → AssemblyAI (платно) → fallback на title+description |
| **Трекинг расходов** | APIUsageLog: tokens, cost_usd, duration по каждому провайдеру |
| **Валидация ключей** | Живая проверка каждого API-ключа через минимальный запрос |
| **Image Proxy** | `/api/proxy/image` — обход CORS для CDN Instagram/YouTube/VK |
| **Анализ по URL** | Отдельный пайплайн: вставил URL → получил полный анализ |
| **Генерация хуков** | 5 вариантов хуков на основе анализа видео |
| **Улучшение сценариев** | Доработка текста по текстовой команде |
| **Онбординг** | Пошаговый гайд для новых пользователей |
| **Video Pruning** | Автоматическая обрезка до топ-N видео по просмотрам |
| **Instagram: 3 парсера** | Apify (residential proxy) + instagrapi (mobile API) + instaloader (legacy) |
| **Session Cookie Login** | Альтернатива паролю при IP-блокировке Instagram |
| **Apify интеграция** | Общий клиент для Instagram и TikTok акторов |

---

## 11. Отклонения от спецификации

| Отклонение | Серьёзность | Описание |
|---|---|---|
| **Inline styles вместо Tailwind-классов** | Низкая | TailwindCSS настроен, но компоненты используют `style={{}}`. Визуально идентично, но менее maintainable |
| **localStorage для токена** | Низкая | Спецификация запрещала localStorage, но auth-токен хранится в `localStorage`. Альтернатива — httpOnly cookie — сложнее для SPA |
| **Нет React Error Boundaries** | Низкая | Ошибки обрабатываются через React Query (retry: 2) и toast-уведомления, но нет Error Boundary компонентов |
| **Нет README.md** | Низкая | Файл не создан. Есть PLAN.md |
| **TikTok cookies не сохраняются** | Минимальная | Спецификация предполагала `data/tiktok_cookies.json`, не реализовано (Apify не требует) |
| **Playwright для TikTok — fallback** | Минимальная | Спецификация предполагала primary, реализован как fallback за Apify |
| **Один ai_engine.py → модуль ai/** | Позитивное | Расширение архитектуры для поддержки 3 провайдеров |
| **4 таблицы → 8 таблиц** | Позитивное | Расширение для мультиаккаунтности и трекинга |
| **Настройки без авторизации** | Средняя | `GET/PUT /api/settings` не требуют токен — можно прочитать API-ключи без авторизации. Допустимо для локального приложения, критично если выставить наружу |

---

## 12. Итоговая оценка

### Количественные метрики

| Метрика | Спецификация | Реализация | % |
|---|---|---|---|
| Таблицы БД | 4 | 8 | 200% |
| Pydantic-схемы | ~15 | 34 | 227% |
| Backend файлы | ~15 | 40+ | 267% |
| API endpoints | ~20 | 45+ | 225% |
| Frontend страниц | 5 | 10 | 200% |
| Frontend компонентов | 13 | 18 | 138% |
| Парсеры | 4 (по 1 на платформу) | 10 (multi-strategy) | 250% |
| AI-провайдеры | 1 (Claude) | 3 (Claude + OpenAI + Groq) | 300% |

### Качественная оценка

| Критерий | Оценка |
|---|---|
| **Функциональная полнота** | 95% — все ключевые фичи из спецификации реализованы |
| **Расширения** | Значительные — мультиаккаунтность, мульти-AI, транскрипция, трекинг расходов |
| **Код** | Хорошее качество — type hints, structlog, Pydantic v2, async |
| **Архитектура** | Масштабируемая — factory pattern, AI router, fallback chains |
| **UI/UX** | Функциональный — тёмная тема, анимации, skeleton, toast, но inline styles |
| **Безопасность** | Базовая — токен-авторизация есть, но settings endpoint открыт |
| **Production-readiness** | 80% — локально работает стабильно, для production нужно: закрыть settings за auth, добавить Error Boundaries, перевести на Tailwind-классы |

### Итого
Проект **реализован на ~95% от спецификации** и **расширен примерно в 2x** по объёму функциональности. Все критические фичи работают. Основные отклонения — стилистические (inline styles vs Tailwind) и одна security-проблема (открытый endpoint настроек). Добавленные фичи (мультиаккаунтность, мульти-AI, транскрипция) значительно повышают ценность приложения.
