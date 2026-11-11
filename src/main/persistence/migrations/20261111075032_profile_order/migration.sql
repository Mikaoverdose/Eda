ALTER TABLE `identities` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY name_key) - 1 AS position FROM identities
)
UPDATE identities SET sort_order = (SELECT position FROM ordered WHERE ordered.id = identities.id);
