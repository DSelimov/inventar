ALTER TABLE `items` MODIFY COLUMN `quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `items` MODIFY COLUMN `min_quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `lots` MODIFY COLUMN `quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `quantity` decimal(14,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `fulfilled_quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `returned_quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `shipment_lines` MODIFY COLUMN `quantity` decimal(14,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_count_lines` MODIFY COLUMN `expected` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `stock_count_lines` MODIFY COLUMN `counted` decimal(14,3);--> statement-breakpoint
ALTER TABLE `stock_levels` MODIFY COLUMN `quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `stock_levels` MODIFY COLUMN `min_quantity` decimal(14,3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `stock_movements` MODIFY COLUMN `delta` decimal(14,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_movements` MODIFY COLUMN `quantity_after` decimal(14,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `quantity_decimals` tinyint DEFAULT 0 NOT NULL;
