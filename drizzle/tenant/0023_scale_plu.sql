ALTER TABLE `items` ADD `plu` varchar(8);--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_plu` UNIQUE(`plu`);