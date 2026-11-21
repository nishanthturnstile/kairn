INSERT INTO kairn_auth."user" (id, email, name)
VALUES ('bc855bfe-2496-44cc-ab12-1a515f4d86f1', 'development-seed@example.test', 'Synthetic Kairn member');
INSERT INTO kairn.accounts (id)
VALUES ('bc855bfe-2496-44cc-ab12-1a515f4d86f1');
INSERT INTO kairn.journeys (id, title, created_by, archived_at)
VALUES ('0eab9ba7-9c9c-48bd-a1d4-cc848725bfaa', 'Synthetic foothills walk',
  'bc855bfe-2496-44cc-ab12-1a515f4d86f1', '2026-06-01T00:00:00Z');
INSERT INTO kairn.journey_memberships (journey_id, account_id, joined_at)
VALUES ('0eab9ba7-9c9c-48bd-a1d4-cc848725bfaa', 'bc855bfe-2496-44cc-ab12-1a515f4d86f1',
  '2026-05-01T12:34:56.123456Z');
INSERT INTO kairn.journey_capabilities (journey_id, account_id, capability)
VALUES ('0eab9ba7-9c9c-48bd-a1d4-cc848725bfaa', 'bc855bfe-2496-44cc-ab12-1a515f4d86f1', 'administrator');
