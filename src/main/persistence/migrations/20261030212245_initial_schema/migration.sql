CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY,
	`active_identity_id` text,
	CONSTRAINT `fk_app_state_active_identity_id_identities_id_fk` FOREIGN KEY (`active_identity_id`) REFERENCES `identities`(`id`) ON DELETE SET NULL,
	CONSTRAINT "app_state_single_row" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `content_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_content_recovery_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_content_recovery_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "content_recovery_version" CHECK("version" > 0),
	CONSTRAINT "content_recovery_value_json" CHECK(CASE WHEN json_valid("value") THEN json_type("value") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `fetch_history` (
	`profile_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`remote` text NOT NULL,
	`url_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fetch_history_pk` PRIMARY KEY(`profile_id`, `repository_id`, `remote`, `url_hash`),
	CONSTRAINT `fk_fetch_history_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_fetch_history_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "fetch_history_version" CHECK("version" > 0),
	CONSTRAINT "fetch_history_value_json" CHECK(CASE WHEN json_valid("value") THEN json_type("value") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `github_accounts` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`login` text NOT NULL,
	`credential_ref` text NOT NULL,
	`state` text NOT NULL,
	CONSTRAINT `fk_github_accounts_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT "github_accounts_state" CHECK("state" IN ('connected', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL UNIQUE,
	`git_name` text NOT NULL,
	`git_email` text NOT NULL,
	`username` text,
	`avatar_path` text,
	`ssh_key_path` text,
	`signing_format` text DEFAULT 'none' NOT NULL,
	`signing_key_ref` text,
	`sign_commits` integer DEFAULT 0 NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "identities_name" CHECK(length(trim("name")) BETWEEN 1 AND 100),
	CONSTRAINT "identities_name_key" CHECK(length("name_key") > 0),
	CONSTRAINT "identities_signing_format" CHECK("signing_format" IN ('ssh', 'gpg', 'none')),
	CONSTRAINT "identities_sign_commits" CHECK("sign_commits" IN (0, 1)),
	CONSTRAINT "identities_rules_json" CHECK(CASE WHEN json_valid("rules") THEN json_type("rules") = 'array' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`record` text NOT NULL,
	CONSTRAINT `fk_operations_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT "operations_version" CHECK("version" > 0),
	CONSTRAINT "operations_record_json" CHECK(CASE WHEN json_valid("record") THEN json_type("record") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `profile_drafts` (
	`profile_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `profile_drafts_pk` PRIMARY KEY(`profile_id`, `repository_id`),
	CONSTRAINT `fk_profile_drafts_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_profile_drafts_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "profile_drafts_value_json" CHECK(CASE WHEN json_valid("value") THEN json_type("value") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `profile_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`source` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_profile_recovery_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `profile_sessions` (
	`profile_id` text NOT NULL,
	`window_id` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `profile_sessions_pk` PRIMARY KEY(`profile_id`, `window_id`),
	CONSTRAINT `fk_profile_sessions_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT "profile_sessions_value_json" CHECK(CASE WHEN json_valid("value") THEN json_type("value") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`favourite` integer DEFAULT 0 NOT NULL,
	`last_opened_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_repositories_identity_id_identities_id_fk` FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `repositories_identity_path` UNIQUE(`identity_id`,`path`),
	CONSTRAINT `repositories_owner` UNIQUE(`identity_id`,`id`),
	CONSTRAINT "repositories_favourite" CHECK("favourite" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `setting_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`repository_id` text,
	`key` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_setting_overrides_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_setting_overrides_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "setting_overrides_value_json" CHECK(json_valid("value"))
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_value_json" CHECK(json_valid("value"))
);
--> statement-breakpoint
CREATE TABLE `workflow_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`record` text NOT NULL,
	`root` text GENERATED ALWAYS AS (json_extract("record", '$.root')) STORED,
	`common_directory` text GENERATED ALWAYS AS (json_extract("record", '$.refChange.commonDirectory')) STORED,
	`mode` text GENERATED ALWAYS AS (json_extract("record", '$.mode')) STORED,
	`state` text GENERATED ALWAYS AS (json_extract("record", '$.state')) STORED,
	CONSTRAINT `fk_workflow_journal_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workflow_journal_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "workflow_journal_record_json" CHECK(CASE WHEN json_valid("record") THEN json_type("record") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE INDEX `content_recovery_owner_created` ON `content_recovery` (`profile_id`,`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `operations_profile_updated` ON `operations` (`profile_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `profile_recovery_profile_created` ON `profile_recovery` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `setting_overrides_profile_key` ON `setting_overrides` (`profile_id`,`key`) WHERE "setting_overrides"."repository_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `setting_overrides_repository_key` ON `setting_overrides` (`profile_id`,`repository_id`,`key`) WHERE "setting_overrides"."repository_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `setting_overrides_owner` ON `setting_overrides` (`profile_id`,`repository_id`);--> statement-breakpoint
CREATE INDEX `workflow_journal_owner_updated` ON `workflow_journal` (`profile_id`,`repository_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `workflow_journal_root_updated` ON `workflow_journal` (`root`,`updated_at`);--> statement-breakpoint
CREATE INDEX `workflow_journal_common_updated` ON `workflow_journal` (`common_directory`,`updated_at`);