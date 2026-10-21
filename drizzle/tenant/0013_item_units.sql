CREATE TABLE `item_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`factor` decimal(14,3) NOT NULL,
	`barcode` varchar(64),
	CONSTRAINT `item_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `item_units_barcode` UNIQUE(`barcode`)
);
--> statement-breakpoint
ALTER TABLE `item_units` ADD CONSTRAINT `item_units_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;