CREATE TABLE `offline_actions` (
	`id` varchar(36) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`payload` json NOT NULL,
	`ok` boolean NOT NULL,
	`message` varchar(500),
	`user_id` int,
	`recorded_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `offline_actions_id` PRIMARY KEY(`id`)
);
