CREATE TABLE `item_prices` (
	`item_id` int NOT NULL,
	`price_group_id` int NOT NULL,
	`price` decimal(14,4) NOT NULL,
	CONSTRAINT `item_prices_item_id_price_group_id_pk` PRIMARY KEY(`item_id`,`price_group_id`)
);
--> statement-breakpoint
CREATE TABLE `price_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`target` enum('retail','cost','group') NOT NULL,
	`price_group_id` int,
	`old_price` decimal(14,4),
	`new_price` decimal(14,4),
	`source` varchar(64) NOT NULL,
	`user_id` int,
	`user_name` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `price_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `price_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_groups_name` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `locations` ADD `price_group_id` int;--> statement-breakpoint
ALTER TABLE `partners` ADD `price_group_id` int;--> statement-breakpoint
ALTER TABLE `partners` ADD `discount_percent` decimal(5,2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `item_prices` ADD CONSTRAINT `item_prices_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_prices` ADD CONSTRAINT `item_prices_price_group_id_price_groups_id_fk` FOREIGN KEY (`price_group_id`) REFERENCES `price_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_changes` ADD CONSTRAINT `price_changes_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_changes` ADD CONSTRAINT `price_changes_price_group_id_price_groups_id_fk` FOREIGN KEY (`price_group_id`) REFERENCES `price_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `price_changes_item` ON `price_changes` (`item_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_price_group_id_price_groups_id_fk` FOREIGN KEY (`price_group_id`) REFERENCES `price_groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `partners` ADD CONSTRAINT `partners_price_group_id_price_groups_id_fk` FOREIGN KEY (`price_group_id`) REFERENCES `price_groups`(`id`) ON DELETE set null ON UPDATE no action;