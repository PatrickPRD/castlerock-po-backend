-- Fix incorrect VAT rates (14% -> 13.5%)
-- Ireland only has 3 VAT rates: 0%, 13.5%, and 23%

-- Step 1: Change column type to support 4 decimal places for 13.5% (0.1350)
ALTER TABLE purchase_orders 
MODIFY COLUMN vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 
COMMENT 'Valid rates: 0, 0.1350, 0.2300';

ALTER TABLE invoices 
MODIFY COLUMN vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 
COMMENT 'Valid rates: 0, 0.1350, 0.2300';

-- Step 2: Fix purchase_orders table (0.14 -> 0.1350)
UPDATE purchase_orders 
SET vat_rate = 0.1350,
    vat_amount = ROUND(net_amount * 0.1350, 2),
    total_amount = net_amount + ROUND(net_amount * 0.1350, 2)
WHERE vat_rate >= 0.1399 AND vat_rate <= 0.1401;

-- Step 3: Fix invoices table (0.14 -> 0.1350)
UPDATE invoices 
SET vat_rate = 0.1350,
    vat_amount = ROUND(net_amount * 0.1350, 2),
    total_amount = net_amount + ROUND(net_amount * 0.1350, 2)
WHERE vat_rate >= 0.1399 AND vat_rate <= 0.1401;

-- Verify the fix
SELECT 'Purchase Orders VAT Rates:' as check_type;
SELECT DISTINCT vat_rate, COUNT(*) as count 
FROM purchase_orders 
GROUP BY vat_rate 
ORDER BY vat_rate;

SELECT 'Invoices VAT Rates:' as check_type;
SELECT DISTINCT vat_rate, COUNT(*) as count 
FROM invoices 
GROUP BY vat_rate 
ORDER BY vat_rate;
