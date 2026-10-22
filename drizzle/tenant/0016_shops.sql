CREATE TABLE `shop_products` (
	`provider` varchar(32) NOT NULL,
	`item_id` int NOT NULL,
	`external_id` varchar(128) NOT NULL,
	`variant_id` varchar(128),
	`sku` varchar(64) NOT NULL,
	`synced_quantity` decimal(14,3),
	`synced_at` datetime(3),
	CONSTRAINT `shop_products_provider_item_id_pk` PRIMARY KEY(`provider`,`item_id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `external_source` varchar(32);--> statement-breakpoint
ALTER TABLE `orders` ADD `external_id` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_external` UNIQUE(`external_source`,`external_id`);--> statement-breakpoint
ALTER TABLE `shop_products` ADD CONSTRAINT `shop_products_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;