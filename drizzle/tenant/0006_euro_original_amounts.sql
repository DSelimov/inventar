ALTER TABLE `order_lines` ADD `original_unit_price` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` ADD `original_currency` varchar(3);