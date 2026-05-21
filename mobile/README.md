# Dezik Staff Mobile

React Native (Expo) приложение для сотрудников. Использует тот же бэкенд что и
веб-админка (`../app/api/telegram/*`).

## Запуск

```sh
cd mobile
npm install
npx expo start
```

Дальше — открыть проект в **Expo Go** на телефоне (отсканировать QR) либо нажать
`i` / `a` в терминале для симулятора iOS / эмулятора Android.

## Структура

```
app/                    Expo Router (file-based routing)
  _layout.tsx           Stack root
  index.tsx             Auth gate → redirects to (auth) or (tabs)
  (auth)/login.tsx      Вход по коду из бота
  (tabs)/orders.tsx     Список заказов (status=1 = новые)
  (tabs)/chat.tsx       Открытые разговоры с клиентами
  (tabs)/profile.tsx    Профиль + выход
lib/
  api.ts                fetch обертка с Authorization header
  auth.ts               SecureStore для токена и staff
  config.ts             API_BASE_URL
  notifications.ts      Регистрация Expo push token
```

## ⚠️ Backend gaps — что нужно добавить в `dezik-admin`

Эта мобилка **не заработает end-to-end** без двух новых эндпоинтов на бэке.
Веб-админка авторизует через `x-telegram-init-data` HMAC, который существует
только внутри Telegram WebApp. Для нативки нужен альтернативный поток.

### 1. `POST /api/telegram/staff/login-code`

Логин по коду из бота. Поток:

1. Сотрудник пишет `/login` боту → webhook генерит 6-значный код, кладёт в
   таблицу `ops_staff_login_codes (code, telegram_id, expires_at)` (TTL 5 мин)
2. Бот отвечает кодом
3. Мобилка вызывает `POST /api/telegram/staff/login-code` с `{ code }`
4. Бэк проверяет код, выпускает JWT (подписан `STAFF_JWT_SECRET`, payload
   `{ sub: staff.id, telegram_id }`), удаляет код
5. Возвращает `{ token, staff }`

### 2. `POST /api/telegram/staff/push-token`

Регистрация Expo push token:

```ts
{ expo_push_token: string, platform: 'ios' | 'android' }
```

- Добавить колонку `ops_staff.expo_push_token TEXT NULL`
- Эндпоинт пишет токен по `staff.id` из JWT
- Затем там, где сейчас идут уведомления менеджерам через Telegram
  (`sendMessage(admin.telegram_id, ...)`), параллельно посылать на
  `https://exp.host/--/api/v2/push/send` с этим токеном

### 3. JWT-аутентификация на staff-эндпоинтах

В `lib/telegram/auth.ts` добавить fallback в `authenticateTelegram`:
если есть header `Authorization: Bearer ...`, проверить JWT и через `sub`
достать staff. Сейчас приложение шлёт токен и как `Bearer`, и как
`x-telegram-init-data` (см. `mobile/lib/api.ts:30`) — чтобы переключиться
без правок клиента, достаточно научить бэк понимать Bearer.

## Текущие фичи (MVP)

- ✅ Логин-флоу UI (бэк нужно дописать)
- ✅ Список заказов из `/api/telegram/orders?status=1`
- ✅ Список разговоров из `/api/telegram/chat/conversations?status=open`
- ✅ Push-токен регистрируется при входе в табы
- ✅ SecureStore для токена

## Следующие шаги

- [ ] Детали заказа (тап на строку) + смена статуса
- [ ] Окно чата + отправка сообщения
- [ ] Каталог товаров (`/api/customer/catalog` адаптировать)
- [ ] Биометрия для разлочки приложения
- [ ] OTA-обновления через EAS Update
