# Instagram integration

This document describes the Instagram support built on top of the Facebook
integration: publishing Reels/Stories, and the Facebook/Instagram tabs with
per-account management and insights. File paths below refer to the application
layout (`server/src/...`, `web/src/...`).

## Overview

Instagram is modelled as a **secondary publishing target attached to a Facebook
Page**. Each connected Facebook Page may have a linked Instagram Business
account (`instagram_business_account`); when present, its id is cached on the
page and unlocks the Instagram features.

Two capabilities were added:

1. **Publishing** Reels and Stories (9:16 video) to Instagram.
2. **Management & insights**: a Facebook/Instagram tab on both the *Page
   management* and *Insights* screens, showing IG media, comments and account
   metrics.

## Publishing model

Instagram has **no native scheduling API**. To keep parity with Facebook's
native scheduling, every Instagram item is a **separate local job**: a
`scheduled_post` row with `platform = 'instagram'`, linked to its Facebook twin
(`linked_post_id`) and sharing the same scheduled time. The internal
`publishScheduler` publishes it at its due time (the server must be running).

- Only **Reels and Stories with a rendered 9:16 video** are eligible.
- The caption mirrors the Facebook item's visual caption (Stories ignore it).
- Job creation is **idempotent** (`idempotency_key = ig:<fbPostId>`), so toggling
  "Publish also on Instagram" twice does not create duplicates.

### Resumable upload flow (Instagram Graph API)

Publishing a video uses Instagram's resumable upload protocol, validated live:

1. `POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES&caption=<enc>`
   → `{ id: containerId }`
2. `POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId>` with
   headers `Authorization: OAuth <pageToken>`, `offset: "0"`,
   `file_size: "<bytes>"`, `Content-Type: application/octet-stream`, body = video
   bytes → `{ success: true }`
3. Poll `GET /<containerId>?fields=status_code` until `FINISHED`
   (`ERROR`/`EXPIRED` → failure)
4. `POST /<igUserId>/media_publish?creation_id=<containerId>` → `{ id: igMediaId }`

The token is always the **Page token** (stored encrypted in `secrets.enc` under the key
`fb.page.<pageId>`), which must carry the Instagram scopes. It is never logged.

## Management & insights tabs

Both `web/src/screens/GestionePaginaScreen.tsx` (page management) and
`web/src/screens/InsightsScreen.tsx` (insights) gained a top-level
**Facebook / Instagram** platform tab. The Instagram tab is shown **only when the
selected page has a linked Instagram account** (`igUserId != null`).

The Instagram panel (`web/src/components/InstagramPanel.tsx`) has three
sub-tabs:

- **Posts & comments** — published IG media (Reels/Posts/Stories) with like and
  comment counts; expand a media to read its comments and **reply / hide /
  delete** them (replies are nested).
- **Scheduled** — pending Instagram jobs (the `platform = 'instagram'`
  `scheduled_post` rows linked to scheduled Facebook items).
- **Account** — profile info (username, bio, followers/following/media counts,
  profile picture) and account insights.

On the Insights screen, the Instagram tab surfaces the IG account totals plus
the per-metric account insights.

## Account profile is read-only

The Instagram Graph API exposes the IG User node as **read-only**: `biography`,
`name`, `username`, `website` and `profile_picture_url` can be **read** but there
is **no update endpoint**. Unlike Facebook Pages (editable via
`pages_manage_metadata`), Instagram profile fields can only be changed from the
Instagram app. The Account tab is therefore informational by design.

## Account insights (graceful degradation)

Account insights are fetched **per metric**, because Instagram's metrics are
inconsistent across versions:

- Each metric is tried first with `metric_type=total_value`, then falls back to
  the legacy time-series form; if both fail the metric is reported as `null`
  with an error, **without** failing the other metrics.
- Default metrics: `reach`, `profile_views`, `follower_count`.
- Notes (API v21): `reach` supports both `total_value` and time-series;
  `profile_views` time-series is deprecated (only `total_value` is meaningful);
  `follower_count` is **not** a `total_value` metric (the time-series fallback is
  the correct path) and is omitted by Instagram for accounts with < 100
  followers. `impressions` is deprecated.

The UI period maps to Instagram's account-insight periods: `month → days_28`,
`week → week`, otherwise `day`.

## Resolving and caching the Instagram account id

`igUserId` is resolved via `GET /<pageId>?fields=instagram_business_account{id}`
and cached on the page row (`facebook_page.ig_user_id`). It is populated:

- **at connect time** (best-effort) when saving a page, and
- **lazily** on `GET /pages` for any page where it is still null (failures are
  ignored so the page list never breaks).

The shared `resolveIgContext(pageId)` helper returns the page token + `igUserId`
for the IG routes, resolving and caching the id on demand, and returns a clear
503 when the page has no linked Instagram account.

## REST endpoints added

All endpoints mirror their Facebook counterparts and live under the page:

| Method & path | Purpose |
| --- | --- |
| `GET /posts/:id/instagram` *(POST)* | Create the IG twin job of a Facebook Reel/Story |
| `DELETE /posts/:id/instagram` | Remove the IG twin job (if not yet published) |
| `GET /pages/:id/ig/account` | IG Business account profile info |
| `GET /pages/:id/ig/insights?period=day` | IG account insights (per-metric degradation) |
| `GET /pages/:id/ig/media?limit=25` | Published IG media |
| `GET /pages/:id/ig/media/:mediaId/comments` | Comments (with nested replies) of a media |
| `POST /pages/:id/ig/comments/:commentId/reply` | Reply to a comment |
| `POST /pages/:id/ig/comments/:commentId/hide` | Hide/unhide a comment (`hide=true|false`) |
| `DELETE /pages/:id/ig/comments/:commentId` | Delete a comment |

`GET /pages` now also exposes `igUserId` per page (used by the UI to decide
whether to show the Instagram tab).

## Files touched

**Database**

- Migration **V24**: `facebook_page.ig_user_id`,
  `scheduled_post.platform` (`'facebook' | 'instagram'`),
  `scheduled_post.linked_post_id`, `scheduled_post.ig_media_id`.

**Backend (`server/src`)**

- `facebook/instagramClient.ts` — Instagram Graph client: `getIgUserId`,
  `publishVideo` (resumable), `getIgAccount`, `fetchIgMedia`, `fetchIgComments`,
  `replyToIgComment`, `setIgCommentHidden`, `deleteIgComment`,
  `fetchIgAccountInsights`.
- `services/instagramPublisher.ts` — `createInstagramJob`,
  `publishInstagramJob`.
- `scheduler/publishScheduler.ts` — routes a job by `post.platform`.
- `services/pageConnectService.ts` — best-effort `igUserId` population on
  connect.
- `routes.ts` — `resolveIgContext` helper, the `/pages/:id/ig/*` routes,
  `/posts/:id/instagram`, and lazy `igUserId` backfill on `GET /pages`.
- `serialize.ts` — `pageDto` exposes `igUserId`.

**Frontend (`web/src`)**

- `api/types.ts`, `api/endpoints.ts` — Instagram types and API calls;
  `FacebookPage.igUserId`.
- `components/InstagramPanel.tsx` — the Instagram tab (media, comments,
  scheduled jobs, account + insights).
- `screens/GestionePaginaScreen.tsx`, `screens/InsightsScreen.tsx` — the
  Facebook/Instagram platform tabs.

## Meta app setup

To use these features the Meta app needs the **"Instagram API with Facebook
Login"** product and the `instagram_basic` + `instagram_content_publish`
permissions. Each Instagram Business account must be assigned to the system user,
and the Page token must be regenerated with the Instagram scopes. The 1-to-1
mapping is **one Facebook Page ↔ one Instagram Business account**.
