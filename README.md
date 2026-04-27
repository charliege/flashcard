# Study Flip

A small flash card site built with plain HTML, CSS, and JavaScript.

## What it does

- Flip the current card to reveal the answer
- Move backward and forward through your deck
- Add and delete cards from the page
- Save cards locally when you want a device-only deck
- Sync cards across phone and laptop when connected to Supabase

## Local use

Open [index.html](/Users/charliege/Documents/New project/flashcard-site/index.html) in a browser, or serve the folder with a static server if you prefer.

## Cloud sync setup

1. Create a Supabase project.
2. In the SQL editor, run [supabase-setup.sql](/Users/charliege/Documents/New project/flashcard-site/supabase-setup.sql).
3. Copy your project URL and publishable or anon key from Supabase.
4. Put them in [config.js](/Users/charliege/Documents/New project/flashcard-site/config.js), or paste them into the in-page setup form on each device.
5. In Supabase Auth URL settings, add your deployed GitHub Pages URL as both the site URL and an allowed redirect URL.
6. Open the site, enter your email, and use the magic link on both phone and laptop.

## Existing synced projects

If you already set up Supabase before topics were added, run
[supabase-topics-migration.sql](/Users/charliege/Documents/New project/flashcard-site/supabase-topics-migration.sql)
once in the Supabase SQL editor, then refresh the site.

If you want card image uploads and front/back image placement on an existing synced project, also run
[supabase-images-migration.sql](/Users/charliege/Documents/New project/flashcard-site/supabase-images-migration.sql)
once and refresh again.

## Notes

- The app stays static, so it still works on GitHub Pages.
- If cloud sync is not configured, the app falls back to browser local storage.
- The publishable or anon key is meant for client-side use when RLS policies are in place.
