ALTER TABLE `users` ADD `totp_secret_enc` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_pending_enc` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_step` int;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_recovery_hashes` json;