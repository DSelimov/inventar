CREATE TABLE `item_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`partner_id` int NOT NULL,
	`supplier_sku` varchar(64),
	`purchase_price` decimal(14,4),
	`min_order_quantity` decimal(14,3),
	`lead_time_days` int,
	`preferred` boolean NOT NULL DEFAULT false,
	CONSTRAINT `item_suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `item_suppliers_item_partner` UNIQUE(`item_id`,`partner_id`)
);
--> statement-breakpoint
ALTER TABLE `item_suppliers` ADD CONSTRAINT `item_suppliers_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_suppliers` ADD CONSTRAINT `item_suppliers_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE cascade ON UPDATE no action;