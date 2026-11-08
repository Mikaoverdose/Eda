CREATE TABLE `gitlab_accounts` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`login` text NOT NULL,
	`credential_ref` text NOT NULL,
	`state` text NOT NULL,
	CONSTRAINT `fk_gitlab_accounts_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT "gitlab_accounts_state" CHECK("state" IN ('connected', 'expired', 'revoked'))
);
