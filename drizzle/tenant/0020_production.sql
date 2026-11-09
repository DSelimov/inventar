CREATE TABLE `production_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`production_id` int NOT NULL,
	`item_id` int NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(14,4) NOT NULL DEFAULT 0,
	`value` decimal(14,2) NOT NULL DEFAULT 0,
	CONSTRAINT `production_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`kind` enum('assembly','disassembly') NOT NULL DEFAULT 'assembly',
	`recipe_id` int,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`location_id` int NOT NULL,
	`total_cost` decimal(14,2) NOT NULL DEFAULT 0,
	`notes` text,
	`created_by` int,
	`created_by_name` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `productions_id` PRIMARY KEY(`id`),
	CONSTRAINT `productions_number` UNIQUE(`number`)
);
--> statement-breakpoint
CREATE TABLE `recipe_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `recipe_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`output_quantity` decimal(14,3) NOT NULL DEFAULT 1,
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stock_movements` MODIFY COLUMN `type` enum('in','out','adjust','transfer_in','transfer_out','write_off','produce_in','produce_out') NOT NULL;--> statement-breakpoint
ALTER TABLE `production_lines` ADD CONSTRAINT `production_lines_production_id_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `productions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_lines` ADD CONSTRAINT `production_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productions` ADD CONSTRAINT `productions_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productions` ADD CONSTRAINT `productions_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productions` ADD CONSTRAINT `productions_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_lines` ADD CONSTRAINT `recipe_lines_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_lines` ADD CONSTRAINT `recipe_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `recipes_item` ON `recipes` (`item_id`);