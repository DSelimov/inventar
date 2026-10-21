CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	`monthly_price` decimal(10,2) NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`max_users` int,
	`max_items` int,
	`max_locations` int,
	`max_invoices_per_month` int,
	`api_access` boolean NOT NULL DEFAULT false,
	`integrations` boolean NOT NULL DEFAULT false,
	`description` varchar(500),
	`active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `plan_id` int;--> statement-breakpoint
ALTER TABLE `organizations` ADD `subscription_status` enum('trial','active','past_due','cancelled') DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `trial_ends_at` datetime(3);--> statement-breakpoint
ALTER TABLE `organizations` ADD `paid_until` datetime(3);--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Планове (цените и лимитите се редактират в /admin/plans).
INSERT INTO `plans` (`code`, `name`, `monthly_price`, `max_users`, `max_items`, `max_locations`, `max_invoices_per_month`, `api_access`, `integrations`, `description`, `sort_order`) VALUES
  ('start', 'Старт', 19.00, 2, 500, 1, 50, false, false, 'Малък магазин или склад: един обект, до 500 артикула.', 1),
  ('business', 'Бизнес', 49.00, 5, 5000, 5, 500, true, false, 'Няколко обекта, API за онлайн магазин.', 2),
  ('pro', 'Про', 99.00, NULL, NULL, NULL, NULL, true, true, 'Без ограничения, интеграции с куриери и счетоводство.', 3);
--> statement-breakpoint
-- Съществуващите организации: Про, активен абонамент (без промяна за досегашните клиенти).
UPDATE `organizations` SET `plan_id` = (SELECT `id` FROM `plans` WHERE `code` = 'pro'), `subscription_status` = 'active';
