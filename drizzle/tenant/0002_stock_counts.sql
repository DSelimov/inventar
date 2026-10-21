CREATE TABLE `stock_count_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`count_id` int NOT NULL,
	`item_id` int NOT NULL,
	`lot_id` int,
	`lot_number` varchar(120),
	`expected` int NOT NULL DEFAULT 0,
	`counted` int,
	`counted_at` datetime(3),
	CONSTRAINT `stock_count_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(64) NOT NULL,
	`location_id` int NOT NULL,
	`category_id` int,
	`status` enum('open','applied','cancelled') NOT NULL DEFAULT 'open',
	`notes` text,
	`created_by` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`applied_at` datetime(3),
	`applied_by` varchar(200),
	CONSTRAINT `stock_counts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_count_id_stock_counts_id_fk` FOREIGN KEY (`count_id`) REFERENCES `stock_counts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `count_lines_count` ON `stock_count_lines` (`count_id`);