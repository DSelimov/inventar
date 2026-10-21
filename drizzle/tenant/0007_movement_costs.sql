CREATE TABLE `cost_layers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`movement_id` int,
	`order_id` int,
	`original_quantity` decimal(14,3) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(14,4) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cost_layers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD `unit_cost` decimal(14,4);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `unit_cost` decimal(14,4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `value` decimal(14,2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cost_layers` ADD CONSTRAINT `cost_layers_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_layers` ADD CONSTRAINT `cost_layers_movement_id_stock_movements_id_fk` FOREIGN KEY (`movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cost_layers_item` ON `cost_layers` (`item_id`,`id`);--> statement-breakpoint
-- Досегашните движения нямат себестойност: попълва се с текущата доставна цена на артикула, за да
-- сумата на стойностите съвпада с наличността × цена (основата за стойност към дата).
UPDATE `stock_movements` m INNER JOIN `items` i ON i.`id` = m.`item_id` SET m.`unit_cost` = i.`unit_cost`, m.`value` = ROUND(m.`delta` * i.`unit_cost`, 2);
