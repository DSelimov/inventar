ALTER TABLE `memberships` ADD `location_ids` json;--> statement-breakpoint
ALTER TABLE `memberships` ADD `hide_costs` boolean DEFAULT false NOT NULL;