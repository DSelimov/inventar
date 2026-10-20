CREATE TABLE `rate_limits` (
	`key` varchar(191) NOT NULL,
	`hits` int NOT NULL DEFAULT 0,
	`window_start` datetime(3) NOT NULL,
	CONSTRAINT `rate_limits_key` PRIMARY KEY(`key`)
);
