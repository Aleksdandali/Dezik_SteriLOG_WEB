-- Link ops_products to KeyCRM
ALTER TABLE ops_products ADD COLUMN IF NOT EXISTS keycrm_id INTEGER UNIQUE;

-- Map Ukrainian product versions from KeyCRM
UPDATE ops_products SET keycrm_id = 100 WHERE sku = 'BAG-150x230-TR';
UPDATE ops_products SET keycrm_id = 99  WHERE sku = 'BAG-100x200-TR';
UPDATE ops_products SET keycrm_id = 90  WHERE sku = 'BAG-100x200-WH';
UPDATE ops_products SET keycrm_id = 72  WHERE sku = 'BAG-100x200-BR';
UPDATE ops_products SET keycrm_id = 98  WHERE sku = 'BAG-75x150-TR';
UPDATE ops_products SET keycrm_id = 95  WHERE sku = 'BAG-75x150-WH';
UPDATE ops_products SET keycrm_id = 97  WHERE sku = 'BAG-60x100-TR';
UPDATE ops_products SET keycrm_id = 86  WHERE sku = 'DEL-1000';
UPDATE ops_products SET keycrm_id = 105 WHERE sku = 'DEL-500';
UPDATE ops_products SET keycrm_id = 94  WHERE sku = 'DEL-250';
UPDATE ops_products SET keycrm_id = 91  WHERE sku = 'DEL-20';
UPDATE ops_products SET keycrm_id = 102 WHERE sku = 'BIO-1000';
UPDATE ops_products SET keycrm_id = 101 WHERE sku = 'BIO-250';
UPDATE ops_products SET keycrm_id = 76  WHERE sku = 'INS-1000';
UPDATE ops_products SET keycrm_id = 75  WHERE sku = 'INS-500';
UPDATE ops_products SET keycrm_id = 92  WHERE sku = 'INS-250';
UPDATE ops_products SET keycrm_id = 87  WHERE sku = 'SEP-500';
UPDATE ops_products SET keycrm_id = 74  WHERE sku = 'JRN-30';
UPDATE ops_products SET keycrm_id = 84  WHERE sku = 'OIL-30';
UPDATE ops_products SET keycrm_id = 88  WHERE sku = 'TRAY-1L';
UPDATE ops_products SET keycrm_id = 89  WHERE sku = 'TRAY-3L';
