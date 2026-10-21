ALTER TABLE `memberships` ADD `email_digest` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `digest_sent_on` date;