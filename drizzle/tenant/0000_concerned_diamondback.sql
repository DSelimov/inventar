CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`prefix` varchar(16) NOT NULL,
	`key_hash` varchar(64) NOT NULL,
	`scopes` json NOT NULL,
	`last_used_at` datetime(3),
	`created_by` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_name` varchar(200),
	`action` varchar(32) NOT NULL,
	`entity` varchar(32) NOT NULL,
	`entity_id` int,
	`details` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(300) NOT NULL,
	`date` date NOT NULL,
	`type` enum('event','reminder','deadline') NOT NULL DEFAULT 'event',
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`color` varchar(16) NOT NULL DEFAULT '#6366f1',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collection_items` (
	`collection_id` int NOT NULL,
	`item_id` int NOT NULL,
	`added_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `collection_items_collection_id_item_id_pk` PRIMARY KEY(`collection_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`color` varchar(16) NOT NULL DEFAULT '#0ea5e9',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `field_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` enum('text','number','date','select','boolean') NOT NULL DEFAULT 'text',
	`options` text,
	`required` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `field_definitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_field_values` (
	`item_id` int NOT NULL,
	`field_id` int NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `item_field_values_item_id_field_id_pk` PRIMARY KEY(`item_id`,`field_id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(64) NOT NULL,
	`barcode` varchar(64),
	`name` varchar(300) NOT NULL,
	`description` text,
	`category_id` int,
	`parent_id` int,
	`variant_label` varchar(120),
	`tracking` enum('none','lot','serial') NOT NULL DEFAULT 'none',
	`quantity` int NOT NULL DEFAULT 0,
	`min_quantity` int NOT NULL DEFAULT 0,
	`unit` varchar(32) NOT NULL DEFAULT 'бр.',
	`unit_cost` double NOT NULL DEFAULT 0,
	`unit_price` double NOT NULL DEFAULT 0,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `items_id` PRIMARY KEY(`id`),
	CONSTRAINT `items_sku` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`code` varchar(32),
	`address` varchar(500),
	`is_default` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`lot_number` varchar(120) NOT NULL,
	`serial_number` varchar(120),
	`expiry_date` date,
	`quantity` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `lots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` int NOT NULL,
	`fulfilled_quantity` int NOT NULL DEFAULT 0,
	`unit_price` double NOT NULL DEFAULT 0,
	CONSTRAINT `order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('purchase','sales') NOT NULL,
	`number` varchar(64) NOT NULL,
	`partner_id` int,
	`location_id` int,
	`status` enum('draft','confirmed','partial','completed','cancelled') NOT NULL DEFAULT 'draft',
	`order_date` date,
	`expected_date` date,
	`notes` text,
	`created_by` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('supplier','customer','both') NOT NULL DEFAULT 'both',
	`name` varchar(200) NOT NULL,
	`contact_name` varchar(200),
	`email` varchar(255),
	`phone` varchar(64),
	`address` varchar(500),
	`vat_number` varchar(32),
	`lead_time_days` int,
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `shipment_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipment_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` int NOT NULL,
	`lot_number` text,
	`expiry_date` date,
	`lot_id` int,
	CONSTRAINT `shipment_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(120) NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`status` enum('pending','in_transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`location_id` int,
	`order_id` int,
	`partner_id` int,
	`partner` varchar(200),
	`carrier` varchar(120),
	`tracking_number` varchar(120),
	`expected_date` date,
	`delivered_at` datetime(3),
	`notes` text,
	`created_by` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_levels` (
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`min_quantity` int NOT NULL DEFAULT 0,
	CONSTRAINT `stock_levels_item_id_location_id_pk` PRIMARY KEY(`item_id`,`location_id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`location_id` int,
	`lot_id` int,
	`user_id` int,
	`user_name` varchar(200),
	`type` enum('in','out','adjust','transfer_in','transfer_out') NOT NULL,
	`delta` int NOT NULL,
	`quantity_after` int NOT NULL,
	`reason` varchar(500),
	`shipment_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhook_id` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`status_code` int,
	`success` boolean NOT NULL DEFAULT false,
	`error` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(1000) NOT NULL,
	`secret` varchar(128) NOT NULL,
	`events` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `collection_items` ADD CONSTRAINT `collection_items_collection_id_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_items` ADD CONSTRAINT `collection_items_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_definitions` ADD CONSTRAINT `field_definitions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_field_values` ADD CONSTRAINT `item_field_values_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_field_values` ADD CONSTRAINT `item_field_values_field_id_field_definitions_id_fk` FOREIGN KEY (`field_id`) REFERENCES `field_definitions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lots` ADD CONSTRAINT `lots_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lots` ADD CONSTRAINT `lots_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_partner_id_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_levels` ADD CONSTRAINT `stock_levels_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_levels` ADD CONSTRAINT `stock_levels_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_webhook_id_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `events_date` ON `calendar_events` (`date`);--> statement-breakpoint
CREATE INDEX `items_barcode` ON `items` (`barcode`);--> statement-breakpoint
CREATE INDEX `items_parent` ON `items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `lots_item_loc` ON `lots` (`item_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `movements_created` ON `stock_movements` (`created_at`);--> statement-breakpoint
CREATE INDEX `movements_item` ON `stock_movements` (`item_id`);--> statement-breakpoint
CREATE INDEX `deliveries_webhook` ON `webhook_deliveries` (`webhook_id`);