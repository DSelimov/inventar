ALTER TABLE `organizations` ADD `deletion_requested_at` datetime(3);--> statement-breakpoint
ALTER TABLE `organizations` ADD `deletion_requested_by` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `terms_version` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` datetime(3);