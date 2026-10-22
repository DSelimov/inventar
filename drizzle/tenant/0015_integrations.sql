CREATE TABLE `integration_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`action` varchar(64) NOT NULL,
	`ok` boolean NOT NULL,
	`http_status` int,
	`message` varchar(1000),
	`duration_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `integration_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`provider` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`credentials_enc` text,
	`settings` json,
	`last_sync_at` datetime(3),
	`updated_at` datetime(3),
	CONSTRAINT `integrations_provider` PRIMARY KEY(`provider`)
);
--> statement-breakpoint
ALTER TABLE `shipments` ADD `carrier_provider` varchar(16);--> statement-breakpoint
ALTER TABLE `shipments` ADD `carrier_label_url` varchar(1000);--> statement-breakpoint
ALTER TABLE `shipments` ADD `carrier_parcel_ids` json;--> statement-breakpoint
ALTER TABLE `shipments` ADD `carrier_status` varchar(200);--> statement-breakpoint
ALTER TABLE `shipments` ADD `carrier_status_at` datetime(3);--> statement-breakpoint
ALTER TABLE `shipments` ADD `cod_amount` decimal(14,4);--> statement-breakpoint
ALTER TABLE `shipments` ADD `cod_collected_amount` decimal(14,4);--> statement-breakpoint
ALTER TABLE `shipments` ADD `cod_collected_at` datetime(3);--> statement-breakpoint
ALTER TABLE `shipments` ADD `cod_paid_at` datetime(3);--> statement-breakpoint
CREATE INDEX `integration_logs_provider` ON `integration_logs` (`provider`,`created_at`);