-- Unified product catalog for ops tracking
CREATE TABLE ops_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bags', 'chemistry', 'cleaning', 'antiseptic', 'accessories', 'raw')),
  bag_size TEXT,
  bag_material TEXT,
  unit TEXT NOT NULL DEFAULT 'шт',
  cost_price NUMERIC(10,2),
  sell_price NUMERIC(10,2),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ops_products FOR ALL USING (true) WITH CHECK (true);

-- Seed all products from order form + raw materials
INSERT INTO ops_products (sku, name, category, bag_size, bag_material, unit, cost_price, sell_price, sort_order) VALUES
  -- Bags (from Бланк замовлення)
  ('BAG-150x230-TR', 'Пакети 150×230 прозорі', 'bags', '150x230', 'transparent', 'уп', 1.44, 2.40, 10),
  ('BAG-100x200-TR', 'Пакети 100×200 прозорі', 'bags', '100x200', 'transparent', 'уп', 1.14, 1.90, 20),
  ('BAG-100x200-WH', 'Пакети 100×200 білі', 'bags', '100x200', 'white', 'уп', 0.96, 1.60, 30),
  ('BAG-100x200-BR', 'Пакети 100×200 коричневі', 'bags', '100x200', 'brown', 'уп', 0.90, 1.45, 40),
  ('BAG-75x150-TR', 'Пакети 75×150 прозорі', 'bags', '75x150', 'transparent', 'уп', 0.93, 1.55, 50),
  ('BAG-75x150-WH', 'Пакети 75×150 білі', 'bags', '75x150', 'white', 'уп', 0.72, 1.20, 60),
  ('BAG-60x100-TR', 'Пакети 60×100 прозорі', 'bags', '60x100', 'transparent', 'уп', 0.84, 1.40, 70),
  -- Chemistry
  ('DEL-1000', 'Деланол 1л', 'chemistry', NULL, NULL, 'шт', 5.43, 8.35, 100),
  ('DEL-500', 'Деланол 0.5л', 'chemistry', NULL, NULL, 'шт', 4.06, 6.25, 110),
  ('DEL-250', 'Деланол 250мл', 'chemistry', NULL, NULL, 'шт', 2.63, 4.05, 120),
  ('DEL-20', 'Деланол 20мл', 'chemistry', NULL, NULL, 'шт', 0.42, 0.65, 130),
  ('BIO-1000', 'Біонол 1л', 'chemistry', NULL, NULL, 'шт', 4.06, 6.25, 140),
  ('BIO-250', 'Біонол 250мл', 'chemistry', NULL, NULL, 'шт', 1.89, 2.90, 150),
  -- Cleaning
  ('INS-1000', 'Інструм 1л', 'cleaning', NULL, NULL, 'шт', 3.15, 4.50, 200),
  ('INS-500', 'Інструм 500мл', 'cleaning', NULL, NULL, 'шт', 2.10, 3.00, 210),
  ('INS-250', 'Інструм 250мл', 'cleaning', NULL, NULL, 'шт', 1.30, 1.85, 220),
  -- Antiseptic & control
  ('SEP-500', 'Септональ 500мл', 'antiseptic', NULL, NULL, 'шт', 1.07, 1.50, 300),
  ('JRN-30', 'Журнал стерилізації 30 стор.', 'accessories', NULL, NULL, 'шт', 1.00, 1.50, 310),
  ('OIL-30', 'Oil Pro 30мл', 'accessories', NULL, NULL, 'шт', 0.90, 1.50, 320),
  -- Trays
  ('TRAY-1L', 'Лоток 1л', 'accessories', NULL, NULL, 'шт', NULL, NULL, 400),
  ('TRAY-3L', 'Лоток 3л', 'accessories', NULL, NULL, 'шт', NULL, NULL, 410),
  -- Raw materials
  ('RAW-PAPER-WH', 'Папір білий крафт 70г/м²', 'raw', NULL, NULL, 'кг', 79.50, NULL, 500),
  ('RAW-PAPER-BR', 'Папір коричневий крафт 70г/м²', 'raw', NULL, NULL, 'кг', 58.00, NULL, 510),
  ('RAW-FILM', 'Плівка ПЕТ', 'raw', NULL, NULL, 'кг', 168.00, NULL, 520),
  ('RAW-GLUE', 'Клей', 'raw', NULL, NULL, 'кг', 270.00, NULL, 530),
  ('RAW-PAINT', 'Фарба для друку', 'raw', NULL, NULL, 'л', 270.00, NULL, 540),
  ('RAW-TAPE', 'Двосторонній скотч', 'raw', NULL, NULL, 'м', 0.48, NULL, 550);
