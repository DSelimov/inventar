CREATE TABLE `vat_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`rate` decimal(5,2) NOT NULL,
	`legal_basis` varchar(255),
	`is_default` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `vat_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `vat_rate_id` int;--> statement-breakpoint
ALTER TABLE `items` ADD `vat_rate_id` int;--> statement-breakpoint
ALTER TABLE `order_lines` ADD `vat_rate_id` int;--> statement-breakpoint
ALTER TABLE `order_lines` ADD `vat_rate` decimal(5,2) DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `prices_include_vat` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `partners` ADD `eik` varchar(13);--> statement-breakpoint
ALTER TABLE `partners` ADD `vat_registered` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `partners` ADD `country` varchar(2) DEFAULT 'BG' NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_vat_rate_id_vat_rates_id_fk` FOREIGN KEY (`vat_rate_id`) REFERENCES `vat_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_vat_rate_id_vat_rates_id_fk` FOREIGN KEY (`vat_rate_id`) REFERENCES `vat_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_vat_rate_id_vat_rates_id_fk` FOREIGN KEY (`vat_rate_id`) REFERENCES `vat_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Ставки по подразбиране (проверете основанията спрямо ЗДДС; редактират се в Настройки › ДДС).
INSERT INTO `vat_rates` (`name`, `rate`, `legal_basis`, `is_default`, `sort_order`) VALUES
  ('Стандартна 20 %', 20.00, NULL, true, 1),
  ('Намалена 9 %', 9.00, NULL, false, 2),
  ('0 % — вътреобщностна доставка', 0.00, 'чл. 53, ал. 1 от ЗДДС', false, 3),
  ('0 % — износ', 0.00, 'чл. 28 от ЗДДС', false, 4),
  ('Без ДДС (нерегистрирано лице)', 0.00, 'чл. 113, ал. 9 от ЗДДС', false, 5);
--> statement-breakpoint
-- Досегашните редове: стандартната ставка (цените са без ДДС).
UPDATE `order_lines` SET `vat_rate_id` = (SELECT `id` FROM `vat_rates` WHERE `is_default` LIMIT 1), `vat_rate` = 20.00;
--> statement-breakpoint
-- Партньори: ЕИК отделно от ДДС номера.
UPDATE `partners` SET `eik` = SUBSTRING(`vat_number`, 3), `vat_registered` = true WHERE `vat_number` REGEXP '^BG[0-9]{9,13}$';
--> statement-breakpoint
UPDATE `partners` SET `eik` = `vat_number`, `vat_number` = NULL WHERE `vat_number` REGEXP '^[0-9]{9,13}$';
