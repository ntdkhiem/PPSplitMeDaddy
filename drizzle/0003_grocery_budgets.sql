CREATE TABLE `grocery_budgets` (
	`period` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
