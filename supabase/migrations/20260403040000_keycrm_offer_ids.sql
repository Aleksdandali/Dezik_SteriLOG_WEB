-- Add KeyCRM offer_id for stock updates via /offers/stocks API
ALTER TABLE ops_products ADD COLUMN IF NOT EXISTS keycrm_offer_id INTEGER;

-- Map offer IDs (from KeyCRM offers endpoint)
UPDATE ops_products SET keycrm_offer_id = 142 WHERE sku = 'BAG-150x230-TR'; -- product 100
UPDATE ops_products SET keycrm_offer_id = 141 WHERE sku = 'BAG-100x200-TR'; -- product 99
UPDATE ops_products SET keycrm_offer_id = 132 WHERE sku = 'BAG-100x200-WH'; -- product 90
UPDATE ops_products SET keycrm_offer_id = 114 WHERE sku = 'BAG-100x200-BR'; -- product 72
UPDATE ops_products SET keycrm_offer_id = 140 WHERE sku = 'BAG-75x150-TR';  -- product 98
UPDATE ops_products SET keycrm_offer_id = 137 WHERE sku = 'BAG-75x150-WH';  -- product 95
UPDATE ops_products SET keycrm_offer_id = 139 WHERE sku = 'BAG-60x100-TR';  -- product 97
UPDATE ops_products SET keycrm_offer_id = 128 WHERE sku = 'DEL-1000';       -- product 86
UPDATE ops_products SET keycrm_offer_id = 168 WHERE sku = 'DEL-500';        -- product 105
UPDATE ops_products SET keycrm_offer_id = 136 WHERE sku = 'DEL-250';        -- product 94
UPDATE ops_products SET keycrm_offer_id = 133 WHERE sku = 'DEL-20';         -- product 91
UPDATE ops_products SET keycrm_offer_id = 144 WHERE sku = 'BIO-1000';       -- product 102
UPDATE ops_products SET keycrm_offer_id = 143 WHERE sku = 'BIO-250';        -- product 101
UPDATE ops_products SET keycrm_offer_id = 118 WHERE sku = 'INS-1000';       -- product 76
UPDATE ops_products SET keycrm_offer_id = 117 WHERE sku = 'INS-500';        -- product 75
UPDATE ops_products SET keycrm_offer_id = 134 WHERE sku = 'INS-250';        -- product 92
UPDATE ops_products SET keycrm_offer_id = 129 WHERE sku = 'SEP-500';        -- product 87
UPDATE ops_products SET keycrm_offer_id = 116 WHERE sku = 'JRN-30';         -- product 74
UPDATE ops_products SET keycrm_offer_id = 126 WHERE sku = 'OIL-30';         -- product 84
UPDATE ops_products SET keycrm_offer_id = 130 WHERE sku = 'TRAY-1L';        -- product 88
UPDATE ops_products SET keycrm_offer_id = 131 WHERE sku = 'TRAY-3L';        -- product 89
