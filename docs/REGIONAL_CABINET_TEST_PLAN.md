# Regional Cabinet Test Plan

## Scope
- RPO/MPO/PPO view mode switching.
- RPO menu/navigation and dashboard visibility.
- Organizations management and head assignment by organization level.
- RPO users tabs (validation/active) and bulk actions.
- Org-head reports filters (monthly/annual, organization).
- Global `Региональные новости` channel in feeds and chats.
- RPO global chat user search.

## Preconditions
- Database migrated with `globalScopeKey` column.
- Backfill executed: `node scripts/backfill-regional-news-channel.mjs`.
- At least one RPO head user, one MPO head user, one PPO head user, regular members.

## Role/Mode checks
- RPO head can switch to `RPO_HEAD` and back to `MEMBER`.
- MPO head can switch to `MPO_HEAD` and back to `MEMBER`.
- PPO head can switch to `PPO_HEAD` and back to `MEMBER`.
- Non-head users cannot switch to head modes.

## Navigation checks
- In `RPO_HEAD` mode sidebar includes: dashboard, organizations, users, reports, news, chats, profile, settings, guide.
- In `MEMBER` mode old member menu remains intact.

## Organizations checks
- RPO can edit organization card fields.
- RPO can assign head:
  - PRIMARY -> PPO head.
  - LOCAL -> MPO head.
  - REGIONAL -> RPO head.
- Existing head for target org is replaced correctly.

## Users checks
- `validation` tab loads pending users across RPO subtree.
- `active` tab loads approved users across RPO subtree.
- Bulk approve updates status to `APPROVED`.
- Bulk exclude updates status to `EXCLUDED`.

## Reports checks
- Organization filter works.
- Periodicity filter works:
  - `monthly` shows only reports with month.
  - `annual` shows only reports with null month.
- Existing status filters still work.

## Regional News checks
- Global channel exists (`globalScopeKey = REGIONAL_NEWS_GLOBAL`).
- News feed for any approved user includes regional channel posts.
- RPO can publish to `Региональные новости`.
- Non-RPO head cannot publish to global regional channel.
- Channel post appears in linked channel chat.

## Chat checks
- RPO user search can find users outside own organization.
- Non-RPO users remain scoped to own organization search.

## Regression checks
- Member dashboard/news/chat flows are not broken.
- PPO head channels/news still work.
- Org-head stats/reports endpoints still return valid data.
