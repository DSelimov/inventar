CREATE TABLE `consignment_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consignment_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(14,4),
	CONSTRAINT `consignment_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`kind` enum('give','report','return') NOT NULL,
	`partner_id` int NOT NULL,
	`location_id` int NOT NULL,
	`warehouse_id` int,
	`order_id` int,
	`notes` text,
	`created_by` int,
	`created_by_name` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `consignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `consignments_number` UNIQUE(`number`)
);
--> statement-breakpoint
ALTER TABLE `locations` ADD `partner_id` int;--> statement-breakpoint
ALTER TABLE `consignment_lines` ADD CONSTRAINT `consignment_lines_consignment_id_consignments_id_fk` FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consignment_lines` ADD CONSTRAINT `consignment_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consignments` ADD CONSTRAINT `consignments_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consignments` ADD CONSTRAINT `consignments_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consignments` ADD CONSTRAINT `consignments_warehouse_id_locations_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consignments` ADD CONSTRAINT `consignments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consignments_partner` ON `consignments` (`partner_id`);