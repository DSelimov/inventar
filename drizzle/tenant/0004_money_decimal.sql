ALTER TABLE `items` MODIFY COLUMN `unit_cost` decimal(14,4) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `items` MODIFY COLUMN `unit_price` decimal(14,4) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `unit_price` decimal(14,4) NOT NULL DEFAULT 0;
