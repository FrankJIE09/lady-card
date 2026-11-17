CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_expires_at_idx` ON `rooms` (`expires_at`);