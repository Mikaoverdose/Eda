DELETE FROM github_accounts
WHERE instr(
  credential_ref,
  'identity:' || profile_id || ':provider:' ||
  json_array(profile_id, 'github-oauth', 'github.com', account_id) || ':'
) <> 1;
