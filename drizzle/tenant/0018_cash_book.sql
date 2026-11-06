CREATE TABLE `cash_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` enum('cash','bank') NOT NULL DEFAULT 'cash',
	`iban` varchar(34),
	`is_default` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cash_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32),
	`direction` enum('in','out') NOT NULL,
	`entry_date` date NOT NULL,
	`account_id` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`partner_id` int,
	`invoice_id` int,
	`order_id` int,
	`invoice_payment_id` int,
	`category` varchar(64),
	`note` varchar(255),
	`created_by` int,
	`created_by_name` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cash_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cash_entries` ADD CONSTRAINT `cash_entries_account_id_cash_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `cash_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_entries` ADD CONSTRAINT `cash_entries_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_entries` ADD CONSTRAINT `cash_entries_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_entries` ADD CONSTRAINT `cash_entries_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_entries` ADD CONSTRAINT `cash_entries_invoice_payment_id_invoice_payments_id_fk` FOREIGN KEY (`invoice_payment_id`) REFERENCES `invoice_payments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cash_entries_date` ON `cash_entries` (`entry_date`);--> statement-breakpoint
CREATE INDEX `cash_entries_partner` ON `cash_entries` (`partner_id`);--> statement-breakpoint
CREATE INDEX `cash_entries_order` ON `cash_entries` (`order_id`);