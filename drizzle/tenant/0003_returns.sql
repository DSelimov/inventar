ALTER TABLE `order_lines` ADD `returned_quantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shipments` ADD `is_return` boolean DEFAULT false NOT NULL;