# Himachali Roots

The website is built straight from the approved design mockup. It's a plain static site with no build step, so it deploys the same way on Vercel, Replit, Netlify, or any web host.

```
index.html      page structure (all pages: Home, Archive, Districts, Dictionary, Submit, About)
styles.css      the approved design, plus the detail view and phone layout
app.js          navigation, live Supabase data, audio, Read more, submissions
backgrounds.js  the list of home page background photos (edit this to change them)
i18n.js         all the Hindi wording (edit this to change Hindi text)
translit.js     the offline 'English letters to Hindi' helper used on the Submit page
districts.js    the text, photos and local favourites for each district page
supabase/       the two Supabase queries (setup, and the Phrase + Culture entries)
images/         artwork and photos; background photos live in images/backgrounds/
vercel.json     caching for images
```

## Layout notes

- **Home hero:** one fixed-shape stage (the approved composition) scaled to fit any screen, so the panel, lettering and text keep the same proportions and never zoom. Photos behind it fill the screen.
- **Phones (portrait, up to 860px wide):** built from the Canva mobile designs. Own portrait photos (`m-hero-*.webp`) and panel (`m-panel.webp`). The header shows MENU and ABOUT; MENU opens a panel that pushes the page down.
- **About:** short version with the full letter under "Read the full story".

## Supabase setup (run once, in this order)

Supabase > **SQL Editor** > **New query**, paste a file from the `supabase/` folder, **Run**:
1. `supabase_setup_v2.sql` adds the new columns, creates or fixes the `submissions` table, sets the permissions, and creates the `Pictures` storage bucket. It is safe to run again.
2. `supabase_update_v3.sql` adds the columns for translator credit, other spellings and Hindi text. It is safe to run again.
3. `supabase_add_phrase_and_culture.sql` adds the phrase "Ghaur auṇā" and the culture entry "Dhaam". It only adds them if they are not there yet.

If the Submit form says it can't send, the message on the page (with a "Technical details" box) says exactly what Supabase answered. Usually it means step 1 has not been run.

## What each Submit form asks for

Word and Phrase have no separate title (the Hindi text is the title). Story, Memory, Song, Audio and Culture have a Title. Recipe uses the dish name in the three name boxes, then Description, Recipe and an optional picture. Audio needs a recording. Song has an artist name, Culture has "who shared this with you", Story has tags (Lullaby, Folk tale, Legend, Bedtime story). Every kind of entry also has an optional picture box. Long texts are limited to 5,000 words, Words and Phrases to 100. The "Convert English letters to Hindi" button is approximate: type a capital T, D, N or R in the middle of a word for the hard sounds (auNa gives औणा).

## Categories

Lullaby is shown as a Story with a "Lullaby" tag. Ballad is shown as Song, Proverb and Riddle as Phrase (each keeps a small tag), and Food is shown as Recipe. Nothing in the database needs changing for this.

## District pages

Picking a district from the Districts menu (or the Districts page) opens a page for that district: a banner photo, a few lines about the place, "locals' favourites" with photos, and then every entry from that district in the archive (these come from Supabase by themselves).

All the text lives in `districts.js`: open it, change the English or Hindi between the quotes, save, and upload it again. Photos go in `images/districts/<district>/`, for example `images/districts/shimla/banner.webp` and `images/districts/shimla/bantony-castle.webp`. The file names are written next to each place in `districts.js`. If a photo is missing, the page shows a plain green panel, so nothing breaks. To add a local favourite, copy one `{ name: ... }` block inside "places" and edit it. A place can have several photos (`photos: [...]`): the first is on its tile, and tapping the tile shows them all. `gallery` is the strip of town photos ("Shimla in pictures").

Each place has a short `line` (shown on its tile) and can have a longer `about` text and a personal `memory` (both shown in the pop-up when the tile is tapped; a blank line starts a new paragraph). Each group of places shows 6 at a time, in a new random order on every visit, and the rest open under "Show more". A district can have extra groups of places in `extraSections` (Shimla has "Beyond Shimla city"). A place with `photos: []` shows a plain green tile until photos are added.

A place can also have `videos: [{ src: 'images/....mp4', poster: 'images/....webp' }]` (they play in the pop-up; a tile that has only a video uses the poster as its picture). An entry in the archive can have a `video_url` (several videos separated with `|`, see `supabase/supabase_update_v4.sql`, which adds the Nati dance).

Everything an entry has beyond the basics (Hindi meaning, picture, context, a sender's note, village, tags, recipe parts, credits) lives INSIDE the `translation` column, each part after a marker line: `[hindi]`, `[context]`, `[picture]`, `[memory]`, `[village]`, `[tags]`, `[description]`, `[recipe]`, `[artist]`, `[source]`, `[translator]`. No extra columns are needed. The card shows only the text before the first marker, plus a small `dialect · village` line under the tag line. Word and Phrase cards get a small ▾ arrow (bottom-left, level with the ▶ play button) when they have extras; the other types use Read more. In the opened card the extras appear as sections (Meaning in Hindi, Listen, Picture, Meaning & context, "A memory from <name>"); a part that is empty adds nothing. `supabase/supabase_publish_fit_existing.sql` writes submissions into `Entries` in exactly this format. The Menu panel and the Districts list fold away as soon as the page is scrolled.

**Recording on the Submit page.** Under the recording box there is a "Record here" button. It first shows its own consent card, then asks the browser for the microphone, records (up to 2 minutes, with a timer and a level bar), cleans the sound (steady background hiss is turned down; the visitor can switch this off to compare), and saves it as a .wav that every phone can play. A file chosen with the box replaces the recording. Browsers that cannot record (some in-app browsers) show a note instead of the button. The sound cleaning is the function `cleanSpeech` in `app.js`. If uploads from the Files app are refused, run `supabase/supabase_fix_audio_upload.sql`.

## Hindi in the cards

People's names are shown in Devanagari automatically (a list of common names in `i18n.js`, otherwise by sound). For an exact spelling, fill the `_hi` column in Supabase (`artist_name_hi`, `contributor_name_hi`, `source_name_hi`, `translator_name_hi`). The Hindi meaning goes in `translation_hi`, and for recipes `description_hi` and `recipe_hi`. Tags and dialect names are translated from the list in `i18n.js` (`words`).

## Search

The Dictionary search ignores capitals and accents, so Amma, amma and ammaa find the same entry, and typing अम्मा finds entries written in English letters. Results are grouped: exact matches first, then similar spellings, then looser mentions. For a tricky word, list other spellings in the `spellings` column in Supabase (for example `ama, ammaa`).

## Languages (English and Hindi)

- Every time the site is opened, a popup asks for English or Hindi (a language the visitor picked before is tagged "last time"). There is also a switch in the header (हिंदी / English) and in the footer. To ask only on a visitor's very first visit instead, set `ASK_EVERY_TIME` to `false` near the top of `app.js`.
- A link like `yoursite.com/?lang=hi` opens the Hindi version directly, with no question (handy for sharing on WhatsApp).
- English text is written in `index.html`. Hindi text is in `i18n.js`: each line there has the same key as a `data-i18n="..."` label in `index.html`. To change a Hindi sentence, edit that one line.
- How entry types (Song, Lullaby...) and district names appear in Hindi is under `types` and `districts` in `i18n.js`. A new type needs one new line there. The database keeps the English name.
- **Hindi meanings for entries (optional).** Entry text comes from Supabase, so it stays as written there. To show Hindi meanings to Hindi visitors, add a column once, then fill it for the entries you want:
  ```sql
  alter table "Entries" add column if not exists translation_hi text;
  ```
  Where `translation_hi` is filled, Hindi visitors see it instead of the English translation. Where it is empty, they see the English one.
- Hindi fonts (Google Fonts, loaded quietly after the page is ready): Rozha One for big headings, Tiro Devanagari Hindi for serif text, Hind for body text, Khand for small labels and the menu, Kalam for the hand-written accent words. To swap one, change its name in the `HINDI MODE` block at the end of `styles.css` and in the font link at the top of `app.js` (`HI_FONTS`).

## Changing the home page background photos

The same site serves computers and phones: it picks the desktop photos on wide screens and the phone photos on portrait phones/tablets, automatically. There is no limit on how many photos you use.

1. Put the photo in `images/backgrounds/desktop/` (wide photos, for computers) and/or `images/backgrounds/mobile/` (tall photos, for phones).
2. Open `backgrounds.js` and add the file's path to the matching list. The order in the list is the order they fade through. Delete a line to remove a photo. `seconds` sets how long each stays.
3. Re-upload the changed files and publish again.

For sharp but fast pages, use about 2400px wide for desktop and about 1170 x 2200px (portrait) for phones, ideally under 500 KB each (JPG or WebP). A wrong file name just skips that photo; the browser console (F12) says which one.

## Deploy

**GitHub Pages (free for a public repository):**
1. Unzip the download. Create a new repository on GitHub (make it **Public**).
2. In the repository choose **Add file → Upload files**, then drag in everything from *inside* the unzipped folder: `index.html`, `styles.css`, `app.js`, `i18n.js`, `backgrounds.js`, the `images` folder, and the rest. `index.html` must be at the top level of the repository, not inside another folder. Click **Commit changes**.
3. Open the repository's **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, pick the branch `main` and the folder `/ (root)`, and save.
4. Wait a few minutes (the first publish can take up to about 10). Your site will be at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
5. To change something later, upload the changed file again (same name) with **Add file → Upload files**; the site updates by itself.

The website reads your content from Supabase, so run the Supabase query that lets the website read the `Entries` table once (see the chat), otherwise the site shows "The archive couldn't be loaded".

**Other hosts (Replit, Vercel, Netlify):** it is a plain static site with no build step, so upload the same files and publish.

**Vercel:** Add New Project, then upload or import this folder. Framework preset: **Other**. Leave the build command empty and the output directory as the root. Deploy.

**Replit:** Create a new **HTML, CSS, JS** Repl, upload these files, and press Run.

**Preview on your computer:** open a terminal in this folder and run `python3 -m http.server 5173`, then open http://localhost:5173.

## Where the content comes from

Everything on the site — home page cards, Archive, Districts counts, Dictionary, Common phrases and the voices count — is read live from the Supabase `Entries` table. There is no built-in sample data. Add or edit rows there, refresh the page, and the change shows up. You never need to redeploy for content.

- Only rows whose `status` is empty, `approved`, `published` or `live` are shown.
- `district` can hold several districts separated by commas (`Shimla, Kullu`). The entry then appears under each of them. `All` makes it appear under every district.
- Songs, stories and recipes show a short preview with **Read more**. That opens the full Original, Romanised and Translation (or Recipe) text, keeping line breaks, numbered steps and bullet lists.
- **Common phrases** on the Dictionary page are the entries whose `type` is `Phrase`. The section hides itself if there are none.
- "Voices" counts unique contributor names. For a credit like `Mohit Chauhan · translated by …`, only the part before the `·` is counted.
- The Submit form sends entries to the `submissions` table with `status = pending`. They do not appear on the site until you add them to `Entries`.

## If the site says "The archive couldn't be loaded"

The message on the page itself says why (the same text is also in the browser console, **F12**, under `[Himachali Roots]`). The most common cause is Supabase Row Level Security blocking public reads. Fix it in the Supabase SQL Editor:

```sql
alter table "Entries" enable row level security;
create policy "Public can read entries" on "Entries" for select to anon using (true);

-- lets the Submit form work
create policy "Public can submit" on "submissions" for insert to anon with check (true);
```

If a policy with that name already exists, Supabase will say so. That's fine, it means it was already set up.
