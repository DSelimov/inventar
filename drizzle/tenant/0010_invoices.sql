CREATE TABLE `invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`item_id` int,
	`order_line_id` int,
	`description` varchar(500) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'бр.',
	`unit_price` decimal(14,4) NOT NULL,
	`vat_rate_id` int,
	`vat_rate` decimal(5,2) NOT NULL,
	`legal_basis` varchar(255),
	`net_amount` decimal(14,2) NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT 0,
	`gross_amount` decimal(14,2) NOT NULL DEFAULT 0,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`paid_on` date NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`method` varchar(64),
	`note` varchar(255),
	`created_by` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `invoice_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('invoice','credit_note','debit_note','proforma') NOT NULL DEFAULT 'invoice',
	`number` varchar(32),
	`status` enum('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
	`issue_date` date,
	`tax_event_date` date,
	`due_date` date,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`prices_include_vat` boolean NOT NULL DEFAULT false,
	`payment_method` varchar(64),
	`order_id` int,
	`related_invoice_id` int,
	`reason` varchar(500),
	`partner_id` int,
	`supplier_name` varchar(300),
	`supplier_eik` varchar(13),
	`supplier_vat_number` varchar(32),
	`supplier_address` varchar(500),
	`supplier_mol` varchar(200),
	`recipient_name` varchar(300),
	`recipient_eik` varchar(13),
	`recipient_vat_number` varchar(32),
	`recipient_address` varchar(500),
	`recipient_country` varchar(2),
	`recipient_mol` varchar(200),
	`net_total` decimal(14,2) NOT NULL DEFAULT 0,
	`vat_total` decimal(14,2) NOT NULL DEFAULT 0,
	`gross_total` decimal(14,2) NOT NULL DEFAULT 0,
	`paid_amount` decimal(14,2) NOT NULL DEFAULT 0,
	`payment_status` enum('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
	`notes` text,
	`created_by` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`issued_at` datetime(3),
	`issued_by` varchar(200),
	`cancelled_at` datetime(3),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_number` UNIQUE(`kind`,`number`)
);
--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_vat_rate_id_vat_rates_id_fk` FOREIGN KEY (`vat_rate_id`) REFERENCES `vat_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `invoices_issue_date` ON `invoices` (`issue_date`);