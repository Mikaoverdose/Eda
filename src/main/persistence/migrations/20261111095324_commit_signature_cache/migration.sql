CREATE TABLE `commit_signatures` (
	`profile_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`oid` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `commit_signatures_pk` PRIMARY KEY(`profile_id`, `repository_id`, `oid`),
	CONSTRAINT `fk_commit_signatures_profile_id_repository_id_repositories_identity_id_id_fk` FOREIGN KEY (`profile_id`,`repository_id`) REFERENCES `repositories`(`identity_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "commit_signatures_value_json" CHECK(json_valid("value"))
);
