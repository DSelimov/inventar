CREATE TABLE `currencies` (
	`code` varchar(3) NOT NULL,
	`name` varchar(64) NOT NULL,
	`rate` decimal(18,8) NOT NULL,
	`source` varchar(16) NOT NULL DEFAULT 'manual',
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `currency` varchar(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `exchange_rate` decimal(18,8);