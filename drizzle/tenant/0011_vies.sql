CREATE TABLE `vies_checks` (
	`vat_number` varchar(32) NOT NULL,
	`valid` boolean NOT NULL,
	`name` varchar(300),
	`address` varchar(500),
	`checked_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `vies_checks_vat_number` PRIMARY KEY(`vat_number`)
);
--> statement-breakpoint
ALTER TABLE `partners` ADD `vies_valid` boolean;--> statement-breakpoint
ALTER TABLE `partners` ADD `vies_checked_at` datetime(3);