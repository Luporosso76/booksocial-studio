# BookSocial Studio User Manual

## Overview

BookSocial Studio turns a book into spoiler-aware social content for Facebook Pages and linked Instagram Business accounts. It helps you import and analyze manuscripts, generate drafts and visuals, schedule posts, publish content, manage comments, and review insights.

The app is local-first. Your data lives in a local SQLite database and local files. Secrets such as Facebook tokens and AI API keys are stored encrypted in `secrets.enc` inside the data folder, not in the database.

The interface is bilingual, Italian and English. The main navigation items are: **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management**, and **Settings**.

For installation and first setup, see [SETUP.md](./SETUP.md). For AI provider details, see [PROVIDERS.md](./PROVIDERS.md). For Instagram-specific setup and behavior, see [INSTAGRAM.md](./INSTAGRAM.md). For the tested local machine and image-generation notes, see [TESTED-ON.md](./TESTED-ON.md).

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Books | Imported Markdown manuscripts. The app analyzes each book into a profile, characters, chapters, and a visual bible. |
| Pages | Connected Facebook Pages. A Page may also have one linked Instagram Business account. |
| Drafts | Generated social content that has not yet been scheduled or published. |
| Scheduled posts | Content queued for future publishing. Some items are scheduled natively on Facebook, while others are handled by the app's internal scheduler. |
| Text provider | The AI provider used for writing posts, book analysis, profiles, characters, hashtags, and other text tasks. |
| Image provider | The provider or local engine used to generate scene images and visuals. |
| Visual bible | A set of structured visual references for the book, including character appearance, scene cards, outfits, props, world details, minor characters, and character presence by chapter. |

### Publishing Model

| Content type | How it is scheduled | What must be running at publish time |
| --- | --- | --- |
| Facebook native posts | Scheduled on Facebook | Facebook publishes them even if BookSocial Studio is off. |
| Facebook Reels and Stories | Internal scheduler | The BookSocial Studio server must be running. |
| Instagram items | Internal scheduler | The BookSocial Studio server must be running. |

Instagram has no native scheduling in this app. Each Instagram scheduled item is a separate local job linked to its Facebook twin.

## Table of Contents

- [Books](#books)
- [Book Analysis and the Visual Bible](#book-analysis-and-the-visual-bible)
- [Book Detail](#book-detail)
- [Connection](#connection)
- [Page Management](#page-management)
- [Planner](#planner)
- [Scheduled](#scheduled)
- [Insights](#insights)
- [Settings: AI](#settings-ai)
- [Graph API Setup: Meta](#graph-api-setup-meta)
- [Common Workflows](#common-workflows)
- [Important Notes](#important-notes)

## Books

The **Books** screen is your library. It lists imported books as cards and gives you the entry point for importing, opening, sampling, or deleting books.

### What it does

Each book card shows the book title, author, language badge, and base-hashtag count. If the library is empty, the screen offers two starting points: import a book or try the bundled sample book, **The Keeper of the Tides**.

### What you can do

| Action | How it works |
| --- | --- |
| Import a book | Import a Markdown file with the `.md` extension. |
| Set optional metadata | During import, you can set the author and language. |
| Open a book | Open the book card to manage profile, chapters, characters, links, images, and music. |
| Try the sample book | Import the bundled sample book, **The Keeper of the Tides**. |
| Delete a book | Remove a book from the library. |

### Notes

- Only Markdown files with the `.md` extension can be imported.
- The book appears immediately after import.
- AI analysis runs in the background after import.
- Analysis requires a configured text provider. If no text provider is configured, analysis fails with a clear error.
- Progress is polled by the app, and a toast confirms completion.

## Book Analysis and the Visual Bible

After a book is imported, BookSocial Studio analyzes it and builds a spoiler-aware structure used for post generation and image consistency.

### What it does

The analysis extracts chapters, creates an AI-generated profile with synopsis, genres, and tone, and identifies characters. The visual bible is a background, resumable, best-effort pipeline. If one step fails, the other steps can still run.

The canonical visual bible steps are:

| Order | Step | Purpose |
| --- | --- | --- |
| 1 | Character appearance | Creates a stable physical description per character for consistent images. |
| 2 | Chapter scene cards | Creates per-chapter location, environment, main and secondary objects, characters present, and physics or realism rules. These drive image prompts. |
| 3 | Outfits | Creates canonical clothing per character, with variants per recurring setting. |
| 4 | Props & world | Extracts recurring vehicles and objects, plus driving side, left or right, inferred from the book. |
| 5 | Minor characters | Scans incidental figures per chapter and assigns fixed appearances. This step is slow. |
| 6 | Character presence | Records which chapters each character appears in. This is used to filter image generation by character. |

### What you can do

| Action | Where | Result |
| --- | --- | --- |
| Follow import progress | Import modal | Shows the three import steps: Read, Analyze, Save. |
| Review visual bible status | Book screen visual bible panel | Shows each step as pending, running, done, or failed, with a done/total counter. |
| Build the whole visual bible | Visual bible panel | Runs all visual bible steps. |
| Run one step | Visual bible panel | Runs only the selected visual bible step. |

### Notes

- The visual bible is built in the background.
- The process is resumable and best-effort.
- A failure in one visual bible step does not block the others.
- The character presence step is used later when choosing characters for image generation.

## Book Detail

The book detail screen is where you manage the operational data for one book. It has six tabs: **Profile**, **Chapters**, **Characters**, **Links**, **Images**, and **Music**.

### What it does

This screen lets you edit the book data that controls content generation: title, author, hashtags, visual directions, associated Pages, chapters, characters, book links, generated images, and music-related book data.

### What you can do

| Tab | Actions |
| --- | --- |
| Profile | Rename title and author; edit base hashtags; configure visual directives; edit props and world; review minor characters; associate the book with connected Pages. |
| Chapters | Include or exclude chapters; edit scene cards; regenerate scene cards; save scene card changes. |
| Characters | Add, edit, and delete characters; generate appearances; generate outfits; review read-only chapter presence. |
| Links | Add, edit, and delete book links. |
| Images | Generate scene images; view images in a lightbox; regenerate images; upload images manually; regenerate selected images in batch. |
| Music | Access the book's Music tab. |

### Profile Tab

The **Profile** tab controls the book-level settings that apply across generated content.

| Field or area | What it means | Editable |
| --- | --- | --- |
| Title | Book title. | Yes |
| Author | Book author. | Yes |
| AI-generated profile | Synopsis, genres, and tone. | No |
| Anti-spoiler badge | Indicates that anti-spoiler behavior is active. | No |
| Base hashtags | Hashtags applied to every post for the book. | Yes |
| Visual domains | Predefined visual directive toggles per book. | Yes |
| Free-text art directions | Additional visual instructions, auto-translated to English for image prompts. | Yes |
| Props & world | Country, driving side, and recurring objects list. | Yes |
| Minor characters | List of incidental figures from the visual bible. | Yes |
| Associated pages | Connected Pages linked to this book. | Yes |

Generation always targets an associated Page, so link the book to the Pages you want to use for content generation.

### Chapters Tab

The **Chapters** tab controls chapter-level availability and image prompt data.

| Action | Result |
| --- | --- |
| Include a chapter | Allows the chapter to be used in image batches. |
| Exclude a chapter | Skips the chapter in image batches. |
| Edit a scene card | Changes location, environment, objects, characters, or physics rules. |
| Regenerate a scene card | Recreates the chapter scene card. |
| Save a scene card | Stores your edits. |

### Characters Tab

The **Characters** tab controls cast information and visual consistency.

| Field or action | Purpose |
| --- | --- |
| Name | Character name. |
| Role | Role in the book. |
| Job | Character job. |
| Character | Character description. |
| Physical appearance | Stable appearance used for image consistency. |
| Notes | Additional character notes. |
| Outfits per context | Clothing definitions for recurring settings. |
| Generate appearances | Creates or refreshes character appearance descriptions. |
| Generate outfits | Creates or refreshes outfit definitions. |
| Presence | Read-only list of chapters where the character appears. |

### Links Tab

The **Links** tab stores book links that can be used by channel and policy.

| Field | Meaning |
| --- | --- |
| Channel type | The channel the link is intended for. |
| Usage policy | How the link should be used. |
| URL | The link target. |
| Label | Human-readable link label. |
| Default flag | Marks a link as the default. |

### Images Tab

The **Images** tab manages generated and uploaded scene images.

| Action | Details |
| --- | --- |
| Generate scene images | Choose count per chapter, aspect ratio, chapters, optional characters, and optional flashback settings. |
| Leave chapters empty | Uses an automatic anti-spoiler spread. |
| Feature characters | Optionally choose characters to include. |
| Use flashback | Optionally request a younger age and period outfits for that batch. |
| Track generation | Watch the live counter and per-image timer. |
| Queue more batches | Add additional generation batches. |
| Cancel generation | Stop a running or queued batch. |
| Open lightbox | View full-size image and metadata. |
| Regenerate | Regenerate the selected image. |
| Regenerate with changes | Add extra instructions or flashback settings. |
| Regenerate from chapter | Pick characters from the chapter's cast. |
| Batch regenerate | Regenerate across selected images. |
| Upload manually | Add your own image to the library. |

The image lightbox shows metadata: source chapter or chapters, characters, prompt, timestamp, and catalog note.

### Notes

- Scene image generation runs serially: one image at a time on a single GPU.
- Draft publishing may depend on a ready visual. Drafts with visuals still rendering cannot be published until ready.
- Base hashtags apply to every post for the book.
- Visual directions are auto-translated to English for image prompts.

## Connection

The **Connection** screen connects BookSocial Studio to Facebook Pages by using a Meta System User Page token.

### What it does

It stores Page tokens encrypted in `secrets.enc` and lets you choose which Pages the app should manage. Tokens are never stored in the database.

### What you can do

| Action | Result |
| --- | --- |
| Paste a Page access token | Starts the connection flow. |
| Connect | The app lists the Pages managed by that token. |
| Select Pages | Chooses which Pages BookSocial Studio should manage. |
| Save | Stores the selected Page connections. |
| Review connected Pages | Each saved Page shows a **Connected** badge. |
| Remove a Page | Removes a saved Page from the app. |
| Disconnect all | Clears tokens from the encrypted store. |

### Notes

- On save, the app auto-detects the Instagram Business account linked to each Page through `instagram_business_account`.
- If the Instagram account is not found immediately, it is resolved lazily later.
- The Instagram tab in Page management appears only when a Page has a linked Instagram Business account.
- For Instagram setup details, see [INSTAGRAM.md](./INSTAGRAM.md).

## Page Management

The **Page management** screen is where you operate connected Pages after setup. It has platform tabs at the top.

### What it does

The screen lets you manage published Facebook content, comments, native Facebook scheduled content, Page settings, Instagram media comments, Instagram internal scheduled jobs, and Instagram account information.

The **Facebook** platform tab is always available. The **Instagram** platform tab appears only if the selected Page has a linked Instagram Business account.

### What you can do

| Platform | Area | Actions |
| --- | --- | --- |
| Facebook | Posts & comments | Review published posts, edit text, pin or unpin, view and manage comments, delete posts. |
| Facebook | Create post drawer | Publish now or schedule a native Facebook post with text, optional link, and optional date. |
| Facebook | Scheduled on Facebook | View content scheduled natively on Facebook. |
| Facebook | Page settings | Edit about or description, website, contact, and cover image, then save to Facebook. |
| Instagram | Posts & comments | Review published Reels, Posts, and Stories with like and comment counts; manage comments. |
| Instagram | Scheduled | Review pending internal Instagram jobs linked to scheduled Facebook Reels or Stories. |
| Instagram | Account | View profile information. |

### Facebook: Posts & Comments

The **Posts & comments** sub-tab lists published Facebook posts with thumbnail, date, excerpt, and badges such as **pinned** or **not published**.

| Action | Result |
| --- | --- |
| Edit text | Updates the post text. |
| Pin or unpin | Changes whether the post is pinned. |
| View comments | Opens comment management for the post. |
| Reply | Adds a nested comment reply. |
| Hide or unhide | Changes comment visibility. |
| Like | Likes a comment. |
| Delete comment | Deletes a comment. |
| Delete post | Deletes the post. |

The **Create post** drawer includes a live Facebook-style preview and requires explicit confirmation. If the date is empty, the post is published immediately. If a date is provided, it is scheduled natively on Facebook.

### Facebook: Scheduled on Facebook

This sub-tab shows content scheduled natively on Facebook.

### Facebook: Page Settings

This sub-tab lets you edit Page fields and save them to Facebook.

| Field | Result |
| --- | --- |
| About or description | Updates the Page text field. |
| Website | Updates the Page website. |
| Contact | Updates Page contact information. |
| Cover image | Updates the Page cover image. |

### Instagram: Posts & Comments

The Instagram media sub-tab shows published Reels, Posts, and Stories with like and comment counts.

| Action | Result |
| --- | --- |
| Expand a media item | Opens its comments. |
| Reply | Adds a nested comment reply. |
| Hide comment | Hides a comment. |
| Delete comment | Deletes a comment. |

### Instagram: Scheduled

This sub-tab shows pending internal Instagram jobs. These are the twin jobs of scheduled Facebook Reels or Stories.

### Instagram: Account

This sub-tab shows Instagram profile information.

| Field | Editable in BookSocial Studio |
| --- | --- |
| Username | No |
| Bio | No |
| Followers count | No |
| Following count | No |
| Media count | No |
| Picture | No |

### Notes

- Facebook scheduled content shown under **Scheduled on Facebook** is read-only here and should be managed on Facebook.
- Instagram profile fields are read-only through the API. Change them in the Instagram app.
- The Instagram panel appears only when the selected Page has a linked Instagram Business account.

## Planner

The **Planner** screen creates a typical week, month, or custom period of social content for a selected Page and Book.

### What it does

It uses quotas, time windows, the selected book, and the selected Page to generate drafts asynchronously. The app chooses days, times, formats, avoids duplicates, and renders visuals in the background.

### What you can do

| Action | Details |
| --- | --- |
| Pick a Page | Select the connected Page to generate for. |
| Pick a Book | Select the associated book to generate from. |
| Set quotas | Choose how many posts, reels and stories to generate in the chosen period (total, not per week). |
| Set time windows | Add one time or one time range per weekday. |
| Remove time windows | Remove windows individually. |
| Choose a period | Select week, month, or custom date range. |
| Generate | Start an asynchronous server job that creates drafts and renders visuals. |
| Watch progress | Follow live progress as `N/M`. |
| Cancel | Stop the generation job. Created drafts remain. |

### Periods

| Period | Length |
| --- | --- |
| Week | 7 days; default. |
| Month | 28 days. |
| Custom range | User-selected date range. |

### Time Windows

| Window type | Behavior |
| --- | --- |
| Single time | Publish within about 30 minutes. |
| Time range | The engine picks a time inside the range. |
| No windows | Defaults apply. |

### Generated Drafts List

Each generated draft card shows type, angle, format, status, scheduled time, and a Facebook-style preview. The preview includes a hashtag breakdown: base, specific, and final.

| Draft action | Result |
| --- | --- |
| Edit | Change text, hashtags, and date/time. |
| Regenerate | Creates new text and hashtags, and re-renders the visual. The app polls until ready. |
| Delete | Removes the draft. |
| Publish now | Publishes immediately after explicit confirmation. |
| Schedule publishing | Converts all future-dated drafts into scheduled items after confirmation. |

### Notes

- Reels and Stories are vertical 9:16 video.
- Posts are text/photo content.
- Drafts whose visual is still rendering show a placeholder.
- **Publish now** is disabled until a draft's visual is ready.
- When bulk scheduling, Facebook posts are scheduled natively on Facebook and can publish even if the app is off.
- Reels and Stories are scheduled through the internal scheduler, so the server must be on at the scheduled time.

## Scheduled

The **Scheduled** screen shows the internal publishing queue.

### What it does

It lists Reels and Stories that the BookSocial Studio server will publish automatically at their scheduled times.

### What you can do

| Action | Availability | Result |
| --- | --- | --- |
| Publish now | Per item, with confirmation | Publishes the queued item immediately. |
| Remove | Per item, if not yet published | Removes the item from the internal queue. |
| Publish also on Instagram | Facebook Reels and Stories only, 9:16 video | Creates a twin Instagram job with the same time and linked Facebook item. |
| Remove Instagram twin | Items with a twin Instagram job | Removes the linked Instagram job. |

### Notes

- A prominent banner warns that the server must be running at the scheduled time.
- If the server is not running, Reels, Stories, and Instagram jobs will not go out.
- Native Facebook posts are not handled by this queue and publish independently on Facebook.
- When a Facebook item with an Instagram twin publishes, the server also publishes it to Instagram with the same caption.

## Insights

The **Insights** screen helps you review Page and account performance.

### What it does

You choose a Page and a period, then review Facebook insights and, if linked, Instagram insights.

### What you can do

| Action | Details |
| --- | --- |
| Pick a Page | Use Page tabs. |
| Pick a period | Choose day, week, or month. |
| View Facebook insights | Available for connected Facebook Pages. |
| View Instagram insights | Available when the Page has a linked Instagram Business account. |
| Compare Pages | Available when two or more Pages are connected. |

### Facebook Insights

| Area | What it shows |
| --- | --- |
| KPI tiles | Followers, likes/fans, reach, engagement. |
| Follower trend chart | Gains in green, losses in red, and net total. |
| Top posts | Top 10 by engagement, with views, reach, reactions, comments, shares, and a link to Facebook. |
| History line chart | Reach and followers over time. |
| Coverage sparkline | Coverage trend. |
| Demographics | Top countries, cities, and gender-age. |
| Page comparison table | Comparison across Pages when two or more Pages are connected. |

### Instagram Insights

| Area | What it shows |
| --- | --- |
| Account KPIs | Followers, following, and media count. |
| Account insights for the period | Reach, profile views, and follower count. |

### Notes

- In the Page comparison table, each cell loads independently.
- If one Page fails to load in the comparison table, that Page's cell shows `—`.
- Some Instagram metrics may be unavailable depending on the account or API version. The app degrades gracefully.

## Settings: AI

The **Settings** screen configures the AI text provider, image provider, image mode, and optional image QA.

### What it does

BookSocial Studio uses a pluggable text provider for analysis and writing, and a pluggable image provider for scene visuals. You configure both here.

### What you can do

| Action | Result |
| --- | --- |
| Configure text provider | Enables book analysis, post writing, hashtag generation, and related text tasks. |
| Configure image provider | Enables generated scene images and generated draft visuals. |
| Test text connection | Returns success with a sample or a clear error. |
| Test image connection | Returns success with a sample or a clear error. |
| Choose image mode | Select Library or Direct. |
| Enable image QA | Validates generated images and regenerates failed images with backoff. |

### Text Providers

There are two text-provider families.

| Family | Providers | Authentication and configuration |
| --- | --- | --- |
| Subscription via CLI | opencode, codex (ChatGPT), gemini (Google) | No API key is stored in the app. The panel shows CLI install status, an **Authenticate** button that launches the CLI login, and a **Verify** button that re-checks status. There is an optional model-name field for the CLI. |
| API key | OpenAI and OpenAI-compatible endpoints, Anthropic, Google, Ollama | Enter the API key, optionally set a base URL, and pick the model from a list loaded through **Load models**, with manual fallback. Ollama is local and uses no key. |

For API-key providers, keys are stored encrypted in `secrets.enc`. A key entered once for a provider is reused, for example for images of the same provider, and is shown as already set.

When a specific model name is needed, enter the model you chose / your provider's model name.

### Image Providers

| Provider option | Meaning |
| --- | --- |
| local | Uses an on-device engine. See [TESTED-ON.md](./TESTED-ON.md). |
| auto | Uses local if available, otherwise none. |
| none | Disables generated images; use upload-only. |
| OpenAI | Cloud image provider; reuses the shared text key. |
| Google | Cloud image provider; reuses the shared text key. |
| Stability | Cloud image provider with its own key. |
| Black Forest Labs (FLUX) | Cloud image provider with its own key. |
| Replicate | Cloud image provider with its own key. |
| fal.ai | Cloud image provider with its own key. |

The image model field is free text. Enter the model you chose / your provider's model name. No image model is preset.

### Image Mode

| Mode | Behavior |
| --- | --- |
| Library | Generated images go to a reusable library, and you pick images per draft. |
| Direct | The visual is rendered straight onto drafts during week generation. This needs a working image engine. |

### Image QA

When image QA is enabled, each generated image is validated and regenerated if it fails the check. Retries use backoff.

### Notes

- Anthropic is available as an API-key provider (no subscription login).
- Subscription CLI authentication lives in the CLI itself; no subscription token is stored in BookSocial Studio.
- For provider-specific setup, see [PROVIDERS.md](./PROVIDERS.md).

## Graph API Setup: Meta

Meta setup is required before BookSocial Studio can manage Facebook Pages or linked Instagram Business accounts.

### What it does

The Meta setup gives the app access to Pages, posts, comments, insights, and Instagram publishing where available.

### What you can do

| Area | Requirement |
| --- | --- |
| Facebook | Create a Meta app with Facebook Login. |
| Facebook | Create a System User Page token with permissions to read and manage the Page, posts, comments, and insights. |
| Facebook | Paste the Page token in the **Connection** screen. |
| Instagram | Add the **Instagram API with Facebook Login** product. |
| Instagram | Include `instagram_basic` and `instagram_content_publish`. |
| Instagram | Link the Instagram Business account to the Facebook Page. |
| Instagram | Assign the Instagram Business account to the System User. |
| Instagram | Make sure the Page token carries the Instagram scopes. |

Facebook permissions include examples such as `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments`, and `pages_read_user_content`.

### Notes

- Instagram mapping is one Facebook Page to one Instagram Business account.
- Detailed Instagram notes are in [INSTAGRAM.md](./INSTAGRAM.md).

## Common Workflows

### 1. Import and Analyze a Book

1. Open **Books**.
2. Choose **Import a book**.
3. Select a Markdown `.md` file.
4. Optionally set author and language.
5. Confirm the import.
6. Wait while the app reads, analyzes, and saves the book.
7. Open the book when the completion toast appears.
8. Review the profile, chapters, characters, and visual bible status.

### 2. Configure AI Before Importing

1. Open **Settings**.
2. Choose a text provider.
3. Authenticate through a CLI provider or enter an API key, depending on the provider family.
4. If using an API-key provider, use **Load models** or enter the model you chose / your provider's model name manually.
5. Run the text **Test** action.
6. Choose an image provider if you want generated images.
7. Enter the image model you chose / your provider's model name if required.
8. Run the image **Test** action.
9. Choose **Library** or **Direct** image mode.

### 3. Connect a Facebook Page

1. Open **Connection**.
2. Paste a Meta System User Page access token.
3. Select **Connect**.
4. Review the Pages managed by the token.
5. Select the Pages you want BookSocial Studio to manage.
6. Select **Save**.
7. Confirm that saved Pages show the **Connected** badge.
8. If the Page has a linked Instagram Business account, wait for auto-detection or lazy resolution.

### 4. Associate a Book with a Page

1. Open **Books**.
2. Open the book.
3. Go to the **Profile** tab.
4. Find **Associated pages**.
5. Check the connected Pages that should be allowed for generation.
6. Save the relevant book settings.

### 5. Build or Repair the Visual Bible

1. Open **Books**.
2. Open the book.
3. Expand the **Visual bible** panel.
4. Review each step's status and done/total counter.
5. Select **Build visual bible** to run all steps.
6. Or run a single step if only one area needs work.
7. Review failed steps without assuming the whole pipeline failed, because steps are best-effort and independent.

### 6. Generate Scene Images

1. Open the book.
2. Go to the **Images** tab.
3. Choose the count per chapter.
4. Choose the aspect ratio.
5. Select chapters, or leave chapters empty for an automatic anti-spoiler spread.
6. Optionally choose characters to feature.
7. Optionally enable a flashback with younger age and period outfits for the batch.
8. Start generation.
9. Watch the live counter and per-image timer.
10. Open generated images in the lightbox to review full-size output and metadata.

### 7. Plan a Week of Content

1. Open **Planner**.
2. Pick a Page.
3. Pick a Book associated with that Page.
4. Set the quotas (total for the chosen period) for posts, reels, and stories.
5. Add weekday time windows or leave them empty to use defaults.
6. Choose **week** as the period.
7. Select **Generate**.
8. Watch the live `N/M` progress.
9. Review each generated draft card.
10. Edit, regenerate, delete, or publish drafts as needed.

### 8. Schedule Future Drafts

1. Generate drafts in **Planner**.
2. Review drafts and make edits.
3. Make sure visuals are ready for drafts that require visuals.
4. Select **Schedule publishing**.
5. Read the confirmation explaining the difference between native Facebook scheduling and the internal scheduler.
6. Confirm.
7. Remember that Facebook posts are scheduled natively on Facebook, while Reels and Stories require the BookSocial Studio server at publish time.

### 9. Publish a Draft Immediately

1. Open **Planner**.
2. Find the draft card.
3. Confirm that any required visual is ready.
4. Select **Publish now**.
5. Confirm explicitly.

### 10. Add Instagram Publishing to a Scheduled Reel or Story

1. Open **Scheduled**.
2. Find a Facebook Reel or Story in 9:16 video format.
3. Enable **Publish also on Instagram**.
4. Confirm that a twin Instagram job is created with the same time.
5. Keep the server running at the scheduled time.
6. Remove the twin if you no longer want the Instagram item to publish.

### 11. Manage Facebook Comments

1. Open **Page management**.
2. Select the Page.
3. Open the **Facebook** tab.
4. Open **Posts & comments**.
5. Choose a post.
6. View comments.
7. Reply, hide or unhide, like, or delete comments as needed.

### 12. Review Performance

1. Open **Insights**.
2. Pick a Page.
3. Choose day, week, or month.
4. Review Facebook KPI tiles, charts, top posts, demographics, and history.
5. If Instagram is linked, open the Instagram tab.
6. Review account KPIs and available account insights.
7. If two or more Pages are connected, review the Page comparison table.

## Important Notes

### Security

- Facebook tokens and AI API keys are stored encrypted (AES-256-GCM) in `secrets.enc`, never in the database.
- Subscription CLI authentication lives in the CLI itself. No subscription token is stored in BookSocial Studio.
- Use the **Connection** screen to disconnect Pages or clear stored Page tokens.

### Meta Limits

- Instagram profile fields are read-only through the API. Change them in the Instagram app.
- Instagram has no native scheduling in this app, so Instagram publishing uses internal jobs.
- Some Instagram metrics are inconsistent across API versions and may be unavailable.
- Instagram mapping is one Facebook Page to one Instagram Business account.

### Performance

- Book analysis and week generation are asynchronous and show live progress.
- Local image generation is the heavy part.
- Local image generation runs serially, one image at a time on-device.
- See [TESTED-ON.md](./TESTED-ON.md) for the tested machine and local image-generation notes.

### Server Must Stay On

- The internal scheduler must be running at the scheduled time for Reels, Stories, and Instagram items.
- If the server is off at the scheduled time, those internally scheduled items will not go out.
- Native Facebook posts publish independently because they are scheduled on Facebook.
