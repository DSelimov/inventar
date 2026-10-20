CREATE TABLE `item_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`size_bytes` int NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `item_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `item_images` ADD CONSTRAINT `item_images_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `item_images_item` ON `item_images` (`item_id`,`sort_order`);