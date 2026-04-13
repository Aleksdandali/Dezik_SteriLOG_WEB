# AI Retention Management System -- Architecture & Implementation Plan

**Status**: Draft
**Author**: Alex (PM) | Date: 2026-04-13 | Version: 1.0
**Stakeholders**: Oleksandr (owner/manager), Engineering

---

## 1. Problem Statement

Dezik has ~7800 customers in KeyCRM but only 1-2 managers handling all sales. The current automated retention messaging system sends messages without manager oversight, leading to:

- Messages sent at wrong times or to wrong clients
- No manager judgment applied to client context
- No tracking of what works -- which actions lead to reorders
- Manager has no daily "what should I do" workflow
- Repeat customers slip through the cracks because nobody monitors consumption cycles

**The core need is not automation -- it is AI-assisted prioritization.** The manager wants to decide who to contact and what to say, but needs AI to surface the right clients at the right time with the right context.

**Evidence basis:**
- Existing retention system built but acknowledged as "raw" (project_retention_todo.md)
- SKU matching and consumption tracking already partially built
- Manager already uses Telegram Mini App for daily operations
- Product catalog has known consumption cycles (bags monthly, Delanol monthly, etc.)

---

## 2. Goals & Success Metrics

| Goal | Metric | Baseline | Target | Window |
|------|--------|----------|--------|--------|
| Increase repeat orders | Reorder rate (% clients ordering 2+ times/quarter) | Measure first 2 weeks | +15% | 90 days |
| Recover dormant clients | % dormant clients reactivated (ordered after 60+ days) | 0% (no system) | 10% | 90 days |
| Manager productivity | Tasks completed per day | 0 | 15-20 | 30 days |
| Task-to-order conversion | % of completed tasks that result in an order within 7 days | Unknown | 20% | 60 days |
| Manager adoption | Days per week the system is actively used | 0 | 5/5 | 14 days |

---

## 3. Non-Goals (v1)

- NOT automated messaging. Every outreach is a manual manager action.
- NOT a replacement for KeyCRM. Orders still happen in KeyCRM.
- NOT multi-manager with permissions. Single manager view is fine for now.
- NOT predictive ML model. v1 uses rule-based logic + LLM for natural language.
- NOT customer-facing. This is an internal operations tool.

---

## 4. System Overview

### Data Flow

```
KeyCRM API (orders, customers)
        |
        v
   [Nightly Sync Cron] ---- runs at 03:00 Kyiv time
        |
        v
   Supabase tables (customer_profiles, order_history, consumption_tracking)
        |
        v
   [Task Generation Cron] ---- runs at 07:00 Kyiv time
        |
        v
   retention_tasks table (prioritized, with AI-generated descriptions)
        |
        v
   Telegram Mini App (manager sees tasks, acts on them, logs results)
        |
        v
   task_results table --> feeds back into next day's AI scoring
```

### Architecture Layers

1. **Data Layer** -- Supabase tables storing synced customer data + task state
2. **AI Layer** -- Claude Haiku via API for task generation and client chat
3. **API Layer** -- Next.js API routes serving the Mini App
4. **UI Layer** -- New views in the existing Telegram Mini App page.tsx

---

## 5. Database Schema

### Existing tables (already in Supabase, keep as-is):
- `customer_profiles` -- synced from KeyCRM
- `consumption_tracking` -- tracks product usage cycles
- `retention_messages` -- existing automated messages (keep but deprioritize)

### New table: `retention_tasks`

```sql
CREATE TABLE retention_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Who
  customer_id INTEGER NOT NULL,          -- KeyCRM customer ID
  customer_name TEXT NOT NULL,            -- Denormalized for fast display
  customer_phone TEXT,                    -- For quick call action

  -- What
  task_type TEXT NOT NULL,                -- 'reorder_reminder' | 'new_customer_followup' |
                                          -- 'dormant_winback' | 'vip_thanks' |
                                          -- 'complaint_followup' | 'product_running_low' |
                                          -- 'cross_sell' | 'custom'
  title TEXT NOT NULL,                    -- Ukrainian, human-readable task title
  description TEXT,                       -- AI-generated context + recommendation
  suggested_action TEXT,                  -- 'call' | 'message' | 'viber' | 'telegram'
  suggested_products JSONB,              -- [{product_id, name, reason}]

  -- Priority
  priority INTEGER NOT NULL DEFAULT 50,  -- 1-100, higher = more urgent
  priority_reason TEXT,                  -- Why AI ranked it this way

  -- AI context snapshot (what AI knew when generating)
  ai_context JSONB,                      -- {days_since_order, avg_frequency, total_spent,
                                          --  segment, products_running_low, order_count}

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'postponed' | 'skipped'
  scheduled_date DATE NOT NULL,           -- Which day this task is for

  -- Result (filled by manager)
  result TEXT,                            -- 'ordered' | 'will_think' | 'not_interested' |
                                          -- 'no_answer' | 'wrong_number' | 'other'
  result_note TEXT,                       -- Free text note from manager
  result_order_id INTEGER,               -- If it led to an order, link it
  completed_at TIMESTAMPTZ,

  -- Indexing
  CONSTRAINT valid_status CHECK (status IN ('pending', 'done', 'postponed', 'skipped'))
);

-- Indexes for fast daily queries
CREATE INDEX idx_retention_tasks_date_status ON retention_tasks (scheduled_date, status);
CREATE INDEX idx_retention_tasks_customer ON retention_tasks (customer_id);
CREATE INDEX idx_retention_tasks_priority ON retention_tasks (scheduled_date, priority DESC);
```

### New table: `client_ai_chats`

```sql
CREATE TABLE client_ai_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),

  customer_id INTEGER NOT NULL,          -- KeyCRM customer ID
  manager_id TEXT,                       -- For future multi-manager

  role TEXT NOT NULL,                    -- 'user' | 'assistant'
  content TEXT NOT NULL,

  -- Context sent to AI with this message (for debugging/auditing)
  ai_context_snapshot JSONB
);

CREATE INDEX idx_client_ai_chats_customer ON client_ai_chats (customer_id, created_at);
```

### New table: `retention_stats_daily`

```sql
CREATE TABLE retention_stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  tasks_generated INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_skipped INTEGER DEFAULT 0,
  tasks_postponed INTEGER DEFAULT 0,

  result_ordered INTEGER DEFAULT 0,
  result_will_think INTEGER DEFAULT 0,
  result_not_interested INTEGER DEFAULT 0,
  result_no_answer INTEGER DEFAULT 0,

  -- Revenue attribution (orders placed within 7 days of a completed task)
  attributed_orders INTEGER DEFAULT 0,
  attributed_revenue DECIMAL(10,2) DEFAULT 0,

  -- Segment breakdown
  segment_stats JSONB                    -- {new: {generated: X, completed: Y, ordered: Z},
                                          --  active: {...}, vip: {...}, dormant: {...}}
);
```

### New table: `customer_segments` (materialized view, rebuilt nightly)

```sql
CREATE TABLE customer_segments (
  customer_id INTEGER PRIMARY KEY,
  segment TEXT NOT NULL,                  -- 'new' | 'active' | 'vip' | 'at_risk' | 'dormant' | 'lost'

  -- Precomputed metrics for fast AI context
  total_orders INTEGER,
  total_spent DECIMAL(10,2),
  avg_order_value DECIMAL(10,2),
  avg_order_frequency_days INTEGER,       -- Average days between orders
  days_since_last_order INTEGER,
  last_order_date DATE,
  first_order_date DATE,
  top_products JSONB,                     -- [{product_id, name, quantity_total, last_ordered}]
  products_running_low JSONB,             -- [{product_id, name, estimated_days_remaining}]

  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Segmentation Rules

```
NEW:        first_order_date within last 14 days AND total_orders = 1
ACTIVE:     last_order within avg_frequency * 1.3 AND total_orders >= 2
VIP:        total_spent > 10000 UAH OR total_orders >= 12 (monthly buyer for a year)
AT_RISK:    last_order between avg_frequency * 1.3 and avg_frequency * 2.5
DORMANT:    last_order between avg_frequency * 2.5 and 120 days
LOST:       last_order > 120 days ago
```

---

## 6. AI Prompt Design

### 6A. Daily Task Generation Prompt

This runs once per morning. Input: batch of customers that match trigger rules.
Output: structured JSON tasks.

```
SYSTEM PROMPT:
--------------
You are a sales assistant for Dezik, a Ukrainian brand selling sterilization
products (kraft pouches, Delanol, Bionol, Instrum) to beauty salons.

Your job: analyze customer data and generate prioritized daily tasks for the
sales manager. Each task tells the manager WHO to contact, WHY, and WHAT to
suggest.

Rules:
- Write all task titles and descriptions in Ukrainian
- Be specific: mention product names, days, amounts
- Priority 80-100: urgent (dormant VIP, complaint followup)
- Priority 50-79: important (reorder timing, product running low)
- Priority 20-49: nice to do (cross-sell, new customer check-in)
- Maximum 25 tasks per day. If more candidates exist, pick highest impact.
- Never generate a task for a customer who had a task in the last 7 days
  (unless complaint followup)

Output format: JSON array of task objects.

USER PROMPT (per batch):
------------------------
Today is {date}. Generate retention tasks from this customer data.

Customers needing attention:
{customer_data_array}

Previous task results (last 30 days) for learning:
- Reorder reminders: {X}% led to orders
- New customer followups: {X}% led to orders
- Dormant winbacks: {X}% led to orders
- Product running low: {X}% led to orders

Recent tasks for these customers (to avoid duplicates):
{recent_tasks}

Generate a JSON array. Each item:
{
  "customer_id": number,
  "task_type": "reorder_reminder|new_customer_followup|dormant_winback|vip_thanks|complaint_followup|product_running_low|cross_sell",
  "title": "Ukrainian text, 1 line, action-oriented",
  "description": "2-3 sentences: context + what to say/suggest",
  "suggested_action": "call|message",
  "suggested_products": [{"product_id": N, "name": "...", "reason": "..."}],
  "priority": 1-100,
  "priority_reason": "brief explanation"
}
```

### 6B. Client Card AI Analysis Prompt

Runs on-demand when manager opens a client card. Generates a summary paragraph.

```
SYSTEM PROMPT:
--------------
You are a sales analyst for Dezik. Given a customer's full history, write a
brief Ukrainian-language analysis for the sales manager. Be concise and
actionable.

Include: buying pattern, favorite products, frequency, anything unusual,
and one specific recommendation.

USER PROMPT:
------------
Customer: {name}
Segment: {segment}
Orders: {total_orders} orders, total {total_spent} UAH
Average order: {avg_order_value} UAH every {avg_frequency_days} days
Last order: {last_order_date} ({days_ago} days ago)
Top products: {top_products_list}
Products estimated to run low: {products_running_low}
Recent task results: {recent_tasks_and_results}

Write 3-4 sentences in Ukrainian analyzing this customer and one recommendation.
```

### 6C. Client Chat AI Prompt

Runs when manager asks a question about a specific client. Conversational.

```
SYSTEM PROMPT:
--------------
You are a sales advisor for Dezik, a Ukrainian sterilization products brand.
The manager is asking about a specific customer. Answer in Ukrainian.
Be practical and specific. Suggest products by name, mention timing.

Customer context:
- Name: {name}
- Segment: {segment}
- {total_orders} orders, {total_spent} UAH total
- Avg order every {avg_frequency_days} days
- Last order: {days_since_last} days ago
- Usually buys: {top_products}
- Products running low (estimated): {products_low}
- Last task result: {last_task_result}
- Full order history: {order_list}

Product catalog for reference:
{dezik_product_catalog_with_prices}

Answer the manager's question based on this data.
```

---

## 7. API Routes

All routes under `/api/retention/`:

### Task Management
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/retention/tasks?date=YYYY-MM-DD&status=pending` | Get tasks for a day, filterable by status |
| PATCH | `/api/retention/tasks/[id]` | Update task status + result |
| POST | `/api/retention/tasks/generate` | Manual trigger for task generation (also runs via cron) |
| GET | `/api/retention/tasks/stats?period=today\|week\|month` | Task completion stats |

### Client Cards
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/retention/clients/[id]` | Full client card: profile, orders, segment, AI analysis |
| GET | `/api/retention/clients/[id]/orders` | Order history from KeyCRM (cached) |
| POST | `/api/retention/clients/[id]/chat` | Send message to AI chat, get response |
| GET | `/api/retention/clients/[id]/chat` | Get chat history |

### Dashboard
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/retention/dashboard` | Aggregated stats: tasks, conversions, revenue |
| GET | `/api/retention/dashboard/segments` | Per-segment breakdown |

### Cron (called by Vercel Cron or external scheduler)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/cron/sync-customers` | Nightly KeyCRM sync (03:00) |
| POST | `/api/cron/compute-segments` | Rebuild customer_segments (04:00) |
| POST | `/api/cron/generate-tasks` | AI task generation (07:00) |
| POST | `/api/cron/compute-daily-stats` | Aggregate previous day stats (01:00) |

---

## 8. UI Views for Telegram Mini App

All views live within the existing `app/telegram/page.tsx` view-based routing system.

### View 1: Task List (Main Screen) -- `retention-tasks`

```
+------------------------------------------+
|  RETENTION       Tue, April 14           |
|  [Today] [Tomorrow] [This Week]          |
+------------------------------------------+
|  Completed: 4/12  |  Orders: 2  |  5200 |
+------------------------------------------+
|                                          |
|  PRIORITY                                |
|  ----------------------------------------|
|  [!] Зателефонуй Наталії Кравченко      |
|      VIP, 45 днів без замовлення         |
|      Зазвичай: пакети + Деланол 1л      |
|                                    [->]  |
|  ----------------------------------------|
|  [!] Нова клієнтка Марія -- перше        |
|      замовлення вчора, запитай чи ОК     |
|                                    [->]  |
|  ----------------------------------------|
|                                          |
|  STANDARD                                |
|  ----------------------------------------|
|  [ ] Ані Жирковій -- Деланол 1л         |
|      закінчується через 7 днів           |
|                                    [->]  |
|  ----------------------------------------|
|  [ ] Олені Шевченко -- 30 днів без       |
|      замовлення, раніше щомісяця         |
|                                    [->]  |
+------------------------------------------+
```

**Interactions:**
- Tap task row -> opens Task Detail
- Swipe right -> mark Done (opens result picker)
- Swipe left -> Postpone (+1 day)
- Top stats bar always visible
- Pull to refresh

### View 2: Task Detail -- `retention-task-detail`

```
+------------------------------------------+
|  [<] Task Detail                         |
+------------------------------------------+
|  Зателефонуй Наталії Кравченко           |
|  VIP | 45 днів без замовлення            |
+------------------------------------------+
|  AI рекомендація:                        |
|  "Наталія купує кожні 3 тижні пакети     |
|  100x200 + Деланол 1л. Зазвичай на      |
|  4500 грн. Зараз 45 днів -- це вдвічі   |
|  довше за звичайний цикл. Можливо        |
|  проблема або змінила постачальника.     |
|  Запитай чи все ОК та запропонуй         |
|  знижку на наступне замовлення."         |
+------------------------------------------+
|  Запропонувати:                          |
|  - Пакети 100x200 прозорі (190 грн)     |
|  - Деланол 1л (835 грн)                 |
+------------------------------------------+
|  [Зателефонувати]  [Написати]            |
+------------------------------------------+
|  Result:                                 |
|  [Замовив] [Подумає] [Не цікаво]        |
|  [Не відповів] [Інше]                   |
+------------------------------------------+
|  Note: ___________________________       |
|                                          |
|  [View Client Card]                      |
+------------------------------------------+
```

**Interactions:**
- "Зателефонувати" -> opens phone dialer with customer number
- "Написати" -> opens Viber/Telegram deep link
- Result buttons -> tap to select, then confirm
- "View Client Card" -> navigates to full client view

### View 3: Client Card -- `retention-client`

```
+------------------------------------------+
|  [<] Наталія Кравченко                   |
|  VIP | Клієнт з 15.01.2024              |
+------------------------------------------+
|  23 замовлення | 47,200 грн всього       |
|  Середнє: 2,052 грн кожні 21 день       |
|  Останнє: 28.02.2026 (45 днів тому)     |
+------------------------------------------+
|  AI АНАЛІЗ                               |
|  "Стабільний VIP клієнт, купує           |
|  регулярно кожні 3 тижні. Основні        |
|  продукти: пакети 100x200 + Деланол 1л. |
|  Останнім часом затримка -- можливо      |
|  потребує уваги."                        |
+------------------------------------------+
|  TOP PRODUCTS                            |
|  Пакети 100x200 прозорі    x42 уп       |
|  Деланол 1л                x23 шт       |
|  Журнал стерилізації       x5 шт        |
+------------------------------------------+
|  RECENT ORDERS                           |
|  28.02 -- 4,500 грн (пакети, деланол)   |
|  05.02 -- 2,100 грн (пакети)            |
|  15.01 -- 3,800 грн (пакети, деланол)   |
|  [Show all 23 orders]                    |
+------------------------------------------+
|  TASKS HISTORY                           |
|  12.04 -- Reorder reminder -> No answer  |
|  01.03 -- VIP thanks -> Ordered          |
+------------------------------------------+
|                                          |
|  AI CHAT                                 |
|  ______________________________________  |
|  "Що запропонувати цьому клієнту?"  [>]  |
|                                          |
|  AI: "Наталія зазвичай купує пакети      |
|  100x200 та Деланол 1л разом.           |
|  Запропонуй набір зі знижкою 5%:        |
|  2 уп пакетів + 2 Деланол 1л =          |
|  2,050 грн замість 2,160. Також          |
|  можна запропонувати Bionol як           |
|  альтернативу -- дешевший варіант."      |
+------------------------------------------+
```

**Interactions:**
- AI Analysis loads automatically on card open (one API call)
- AI Chat is an input at the bottom -- type question, get response
- Chat history persists (stored in `client_ai_chats`)
- Phone/message buttons in header (not shown, accessible via action menu)
- Orders section is collapsible

### View 4: Dashboard -- `retention-dashboard`

```
+------------------------------------------+
|  [<] Retention Dashboard                 |
|  [Today] [This Week] [This Month]        |
+------------------------------------------+
|                                          |
|  TODAY                                   |
|  Tasks: 4/12 done (33%)                 |
|  Orders from tasks: 2                    |
|  Revenue: 5,200 UAH                      |
|                                          |
+------------------------------------------+
|  THIS WEEK                               |
|  Tasks: 38/65 done (58%)                |
|  Conversion: 24% (ordered after task)    |
|  Revenue: 28,400 UAH                     |
+------------------------------------------+
|  BY SEGMENT                              |
|  New:      5 tasks, 2 ordered (40%)      |
|  Active:  22 tasks, 8 ordered (36%)      |
|  VIP:      8 tasks, 4 ordered (50%)      |
|  At Risk: 18 tasks, 2 ordered (11%)      |
|  Dormant: 12 tasks, 1 ordered (8%)       |
+------------------------------------------+
|  BEST PERFORMING TASK TYPES              |
|  1. Product running low: 38% convert     |
|  2. VIP thanks: 35% convert              |
|  3. New customer followup: 28% convert   |
|  4. Reorder reminder: 22% convert        |
|  5. Dormant winback: 8% convert          |
+------------------------------------------+
|  TREND (last 4 weeks)                    |
|  W1: 12 orders / 22k UAH                |
|  W2: 15 orders / 31k UAH                |
|  W3: 18 orders / 28k UAH                |
|  W4: 14 orders / 25k UAH                |
+------------------------------------------+
```

---

## 9. Task Generation Logic (Pre-AI Filtering)

Before sending data to Claude Haiku, the cron job runs SQL queries to find
candidates. This keeps AI costs low -- we only send 50-100 customers to AI,
not all 7800.

### Trigger Rules (SQL-based filtering):

```
RULE 1: PRODUCT RUNNING LOW
  customers WHERE estimated_days_remaining <= 7
  AND no task in last 7 days
  Priority boost: +20

RULE 2: OVERDUE REORDER
  customers WHERE days_since_last_order > avg_frequency * 1.3
  AND segment IN ('active', 'vip', 'at_risk')
  AND no task in last 7 days
  Priority boost: proportional to (days_overdue / avg_frequency)

RULE 3: NEW CUSTOMER FOLLOWUP
  customers WHERE first_order within last 2 days
  AND total_orders = 1
  Priority: 60

RULE 4: VIP HIGH-VALUE ORDER
  customers WHERE segment = 'vip'
  AND last_order within 1 day
  AND last_order_value > 5000 UAH
  Priority: 55

RULE 5: DORMANT WINBACK
  customers WHERE segment = 'dormant'
  AND total_spent > 5000 UAH (worth winning back)
  AND no task in last 14 days
  Priority: 40-70 based on lifetime value

RULE 6: COMPLAINT FOLLOWUP
  customers flagged in support/notes
  Priority: 90 (always high)
```

After SQL identifies candidates, they go to Claude Haiku in a single batch.
AI generates human-readable titles, descriptions, and refines priorities.

**Cost estimate:** ~50-100 customers/day x ~500 tokens each = ~50K tokens/day.
Claude Haiku at ~$0.25/M input tokens = about $0.01-0.02/day. Negligible.

---

## 10. Cron Jobs

### Job 1: Sync Customers (03:00 Kyiv, daily)
- Pull all orders from KeyCRM for the last 2 days (delta sync)
- Update `customer_profiles` with latest data
- Update `consumption_tracking` with new orders
- Idempotent: re-running is safe

### Job 2: Compute Segments (04:00 Kyiv, daily)
- Rebuild `customer_segments` table entirely
- Calculate all precomputed metrics per customer
- Run segmentation rules
- Estimate product consumption (products_running_low)

### Job 3: Generate Tasks (07:00 Kyiv, daily)
- Run trigger rules (SQL) to find candidates
- Skip customers with recent tasks (dedup)
- Send batch to Claude Haiku
- Insert results into `retention_tasks` with scheduled_date = today
- Cap at 25 tasks/day

### Job 4: Compute Daily Stats (01:00 Kyiv, daily)
- Aggregate yesterday's task completions into `retention_stats_daily`
- Check for orders placed within 7 days of completed tasks (attribution)
- Update attributed_revenue

### Cron Configuration (vercel.json)
```json
{
  "crons": [
    { "path": "/api/cron/sync-customers", "schedule": "0 1 * * *" },
    { "path": "/api/cron/compute-segments", "schedule": "0 2 * * *" },
    { "path": "/api/cron/generate-tasks", "schedule": "0 5 * * *" },
    { "path": "/api/cron/compute-daily-stats", "schedule": "0 23 * * *" }
  ]
}
```
Note: Vercel cron uses UTC. Kyiv is UTC+3 in summer, UTC+2 in winter.
Adjust schedules for the relevant timezone offset.

---

## 11. Revenue Attribution Logic

How we know if a task "worked":

1. Manager completes a task for Customer X on April 14
2. Manager marks result as "Ordered" -> direct attribution, immediate
3. OR: Customer X places an order in KeyCRM within 7 days of a completed task
   -> indirect attribution (nightly stats job detects this)
4. Revenue from that order is attributed to the retention system

This is not perfect -- some orders would have happened anyway. But for a 1-2
person operation, approximate attribution is far better than no attribution.

---

## 12. Implementation Plan

### Phase 1: Foundation (3-4 days)
1. Create all 4 new Supabase tables (retention_tasks, client_ai_chats,
   retention_stats_daily, customer_segments)
2. Build `/api/cron/sync-customers` -- delta sync from KeyCRM
3. Build `/api/cron/compute-segments` -- segmentation logic
4. Test with real data: verify segments look correct for known customers
5. **Gate: Can query a customer and see correct segment + metrics**

### Phase 2: Task Generation (2-3 days)
1. Build trigger rules as SQL queries
2. Build Claude Haiku integration for task generation
3. Build `/api/cron/generate-tasks`
4. Build `/api/retention/tasks` GET endpoint
5. Run manually, review generated tasks for quality
6. Tune prompts based on output quality
7. **Gate: Generated tasks make sense for 10 manually-verified customers**

### Phase 3: Task List UI (2-3 days)
1. Add `retention-tasks` view to page.tsx
2. Task list with priority grouping
3. Task detail view with AI recommendation display
4. Result logging (status + result type + note)
5. Swipe gestures for quick actions
6. **Gate: Manager can see tasks, tap through, log results end-to-end**

### Phase 4: Client Card + AI Chat (2-3 days)
1. Build `/api/retention/clients/[id]` with aggregated data
2. Build AI analysis generation on card open
3. Build AI chat endpoint with conversation context
4. Add `retention-client` view to page.tsx
5. Wire up navigation from task -> client card
6. **Gate: Manager opens client, sees analysis, asks AI a question, gets answer**

### Phase 5: Dashboard + Stats (1-2 days)
1. Build `/api/cron/compute-daily-stats`
2. Build `/api/retention/dashboard` endpoint
3. Add `retention-dashboard` view
4. Wire up daily stats aggregation
5. **Gate: Dashboard shows accurate numbers for the first week of usage**

### Phase 6: Polish + Activate (1-2 days)
1. Enable all cron jobs
2. Add Telegram notification: morning push "You have 15 tasks today"
3. Tune AI prompts based on first week of real usage
4. Add "Postpone to tomorrow" and bulk actions
5. Fix any UX friction identified during testing
6. **Gate: Manager uses it for 5 consecutive days without issues**

**Total estimated effort: 11-17 days of development**

---

## 13. Key Design Decisions

**Decision 1: Rule-based filtering THEN AI generation (not pure AI)**
We do NOT send 7800 customers to Claude every morning. SQL rules identify
50-100 candidates; AI only writes the human-readable task descriptions and
refines priority. This keeps costs at ~$0.50/month and latency under 10 seconds.
Trade-off: Less "creative" AI discovery of patterns. Acceptable for v1.

**Decision 2: 25 tasks/day cap**
A manager realistically handles 15-20 contacts per day. Generating 100 tasks
would be demoralizing. Cap at 25, prioritize ruthlessly. The manager should
feel "I can finish this list today" not "this is impossible."

**Decision 3: 7-day dedup window**
Do not generate a task for the same customer within 7 days of a previous task.
Exception: complaint followups. Nobody wants to be contacted twice in a week
by a sales call. This protects customer experience.

**Decision 4: AI chat is contextual, not general**
The AI chat on client cards ONLY answers questions about that specific client.
It is not a general chatbot. This keeps the UX focused and prevents the manager
from wasting time on random questions.

**Decision 5: No automated sending**
v1 never sends a message to a customer. The manager reads the task, decides
whether to act, picks up the phone or opens Viber manually. AI assists;
human decides. This is the explicit requirement and the right call for a
small team where relationships matter.

---

## 14. Open Questions (resolve before dev)

- [ ] **KeyCRM order sync scope**: How far back should initial sync go?
      All time? Last 12 months? -- Owner: Oleksandr -- Decide by: before Phase 1

- [ ] **Complaint tracking**: Where do complaints live today? KeyCRM notes?
      Manual? Need a source to generate complaint followup tasks.
      -- Owner: Oleksandr -- Decide by: before Phase 2

- [ ] **Consumption defaults**: Are the existing CONSUMPTION_DEFAULTS in
      the codebase accurate? Do SKUs match between KeyCRM and the consumption
      tracker? (Known issue from project_retention_todo.md)
      -- Owner: Engineering -- Decide by: before Phase 1

- [ ] **Telegram notification**: Should the bot send a morning message to
      the manager ("15 tasks today, 3 priority") or just have tasks ready
      when they open the app? -- Owner: Oleksandr -- Nice to have, Phase 6

- [ ] **KeyCRM rate limits**: 60 req/min. With 7800 customers, initial sync
      will take ~130 minutes if paginated at 50/page. Plan for this.
      -- Owner: Engineering -- Phase 1

---

## 15. What We Are NOT Building (and Why)

| Request | Why Not | Revisit When |
|---------|---------|--------------|
| Automated message sending | Manager wants control; relationships matter at this scale | If task volume exceeds 50/day and manager asks for it |
| Multi-manager views/permissions | Only 1-2 managers exist | If team grows to 3+ |
| ML-based prediction model | Overkill for 7800 customers; rule-based + LLM is sufficient | If conversion data shows rules miss obvious patterns |
| Integration with Viber/Telegram for sending | Adds complexity; manager can copy-paste or call | After v1 proves value, as a v2 convenience feature |
| Customer self-service portal | Different product entirely | Not in scope for retention ops tool |
