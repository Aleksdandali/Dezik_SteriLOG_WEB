-- ═══════════════════════════════════════════════════════
-- Unified Chat System — Phase 1
-- New tables alongside existing ops_order_messages
-- Zero impact on current functionality
-- ═══════════════════════════════════════════════════════

-- Conversations: one per customer (not per order)
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT,
  customer_name TEXT,
  customer_telegram_id BIGINT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  last_message_sender TEXT,
  unread_by_manager INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'telegram_miniapp'
    CHECK (channel IN ('telegram_miniapp', 'telegram_dm', 'instagram', 'viber', 'web_chat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conv_status ON chat_conversations(status, last_message_at DESC);
CREATE INDEX idx_chat_conv_telegram ON chat_conversations(customer_telegram_id);
CREATE INDEX idx_chat_conv_phone ON chat_conversations(customer_phone);
CREATE INDEX idx_chat_conv_unread ON chat_conversations(unread_by_manager DESC) WHERE unread_by_manager > 0;

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON chat_conversations FOR ALL USING (true) WITH CHECK (true);

-- Messages within conversations
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'manager', 'system')),
  sender_telegram_id BIGINT,
  sender_name TEXT,
  channel TEXT NOT NULL DEFAULT 'telegram_miniapp'
    CHECK (channel IN ('telegram_miniapp', 'telegram_dm', 'instagram', 'viber', 'web_chat', 'internal')),
  content_type TEXT NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text', 'image', 'file', 'system')),
  text TEXT,
  media_url TEXT,
  order_id INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_msg_order ON chat_messages(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- Enable Supabase Realtime for instant message delivery
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;

-- ═══════════════════════════════════════════════════════
-- Backfill: migrate existing messages into new system
-- Groups by (sender_telegram_id) to create one conversation per customer
-- ═══════════════════════════════════════════════════════

-- Step 1: Create conversations from existing customer telegram links
INSERT INTO chat_conversations (customer_phone, customer_name, customer_telegram_id, status, last_message_at, channel)
SELECT
  ctl.phone,
  ctl.first_name,
  ctl.telegram_id,
  'open',
  COALESCE(
    (SELECT MAX(m.created_at) FROM ops_order_messages m WHERE m.sender_telegram_id = ctl.telegram_id),
    ctl.last_seen_at
  ),
  'telegram_miniapp'
FROM customer_telegram_links ctl;

-- Step 2: Migrate messages into conversations
INSERT INTO chat_messages (conversation_id, sender_type, sender_telegram_id, channel, content_type, text, order_id, created_at)
SELECT
  cc.id,
  m.sender_type,
  m.sender_telegram_id,
  'telegram_miniapp',
  CASE WHEN m.text LIKE '%supabase.co/storage%' THEN 'image' ELSE 'text' END,
  m.text,
  CASE WHEN m.order_id = 0 THEN NULL ELSE m.order_id END,
  m.created_at
FROM ops_order_messages m
JOIN chat_conversations cc ON cc.customer_telegram_id = m.sender_telegram_id
WHERE m.sender_type = 'customer';

-- Also migrate manager replies (find conversation via customer messages in same order)
INSERT INTO chat_messages (conversation_id, sender_type, sender_telegram_id, channel, content_type, text, order_id, created_at)
SELECT DISTINCT ON (m.id)
  cc.id,
  m.sender_type,
  m.sender_telegram_id,
  'internal',
  'text',
  m.text,
  CASE WHEN m.order_id = 0 THEN NULL ELSE m.order_id END,
  m.created_at
FROM ops_order_messages m
JOIN ops_order_messages cust_msg ON cust_msg.order_id = m.order_id AND cust_msg.sender_type = 'customer'
JOIN chat_conversations cc ON cc.customer_telegram_id = cust_msg.sender_telegram_id
WHERE m.sender_type = 'manager';

-- Step 3: Update conversation previews
UPDATE chat_conversations cc SET
  last_message_preview = sub.text,
  last_message_sender = sub.sender_type,
  last_message_at = sub.created_at
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id, text, sender_type, created_at
  FROM chat_messages
  ORDER BY conversation_id, created_at DESC
) sub
WHERE cc.id = sub.conversation_id;
