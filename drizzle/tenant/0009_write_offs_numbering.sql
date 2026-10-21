CREATE TABLE `document_counters` (
	`doc_type` varchar(32) NOT NULL,
	`year` int NOT NULL,
	`last_number` int NOT NULL,
	CONSTRAINT `document_counters_doc_type_year_pk` PRIMARY KEY(`doc_type`,`year`)
);
--> statement-breakpoint
CREATE TABLE `write_off_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`write_off_id` int NOT NULL,
	`item_id` int NOT NULL,
	`lot_id` int,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(14,4),
	`value` decimal(14,2),
	CONSTRAINT `write_off_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `write_offs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(64) NOT NULL,
	`location_id` int NOT NULL,
	`status` enum('draft','applied','cancelled') NOT NULL DEFAULT 'draft',
	`reason` varchar(500) NOT NULL,
	`commission` text,
	`notes` text,
	`created_by` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`applied_at` datetime(3),
	`applied_by` varchar(200),
	CONSTRAINT `write_offs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stock_movements` MODIFY COLUMN `type` enum('in','out','adjust','transfer_in','transfer_out','write_off') NOT NULL;--> statement-breakpoint
ALTER TABLE `write_off_lines` ADD CONSTRAINT `write_off_lines_write_off_id_write_offs_id_fk` FOREIGN KEY (`write_off_id`) REFERENCES `write_offs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `write_off_lines` ADD CONSTRAINT `write_off_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `write_off_lines` ADD CONSTRAINT `write_off_lines_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `write_offs` ADD CONSTRAINT `write_offs_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Броячите продължават от най-големия съществуващ номер ПРЕФИКС-ГГГГ-NNN (по вид и година).
INSERT INTO `document_counters` (`doc_type`, `year`, `last_number`)
SELECT IF(`type` = 'purchase', 'purchase', 'sales'), CAST(SUBSTRING(`number`, 4, 4) AS UNSIGNED), MAX(CAST(SUBSTRING(`number`, 9) AS UNSIGNED))
FROM `orders` WHERE `number` REGEXP '^П[ЗР]-[0-9]{4}-[0-9]+$'
GROUP BY 1, 2;
--> statement-breakpoint
INSERT INTO `document_counters` (`doc_type`, `year`, `last_number`)
SELECT 'count', CAST(SUBSTRING(`number`, 5, 4) AS UNSIGNED), MAX(CAST(SUBSTRING(`number`, 10) AS UNSIGNED))
FROM `stock_counts` WHERE `number` REGEXP '^ИНВ-[0-9]{4}-[0-9]+$'
GROUP BY 1, 2;
