CREATE TABLE `gitlab_self_hosted_accounts` (
	`profile_id` text NOT NULL,
	`base_url` text NOT NULL,
	`account_id` text NOT NULL,
	`login` text NOT NULL,
	`credential_ref` text NOT NULL,
	`state` text NOT NULL,
	CONSTRAINT `gitlab_self_hosted_accounts_pk` PRIMARY KEY(`profile_id`, `base_url`),
	CONSTRAINT `fk_gitlab_self_hosted_accounts_profile_id_identities_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `identities`(`id`) ON DELETE CASCADE,
	CONSTRAINT "gitlab_self_hosted_accounts_state" CHECK("state" IN ('connected', 'expired', 'revoked'))
);
