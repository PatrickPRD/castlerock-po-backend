ALTER TABLE `invoices`
  DROP INDEX `invoice_number`,
  ADD UNIQUE KEY `uniq_invoice_number_per_po` (`purchase_order_id`, `invoice_number`);