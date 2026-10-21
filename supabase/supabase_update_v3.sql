-- =====================================================================
-- Himachali Roots: Supabase update v3 (run once; safe to run again)
-- Run this AFTER supabase_setup_v2.sql.
-- Supabase > SQL Editor > New query > paste all of this > Run
-- =====================================================================

-- 1) New columns on the Entries table
alter table "Entries" add column if not exists translator_name text;      -- who translated and romanised it (songs)
alter table "Entries" add column if not exists spellings text;            -- other ways to spell it, comma separated, e.g. ama, ammaa
alter table "Entries" add column if not exists title_hi text;             -- Hindi title (only needed when the title is in English)
alter table "Entries" add column if not exists description_hi text;       -- Hindi version of "description" (recipes)
alter table "Entries" add column if not exists recipe_hi text;            -- Hindi version of "recipe"
alter table "Entries" add column if not exists artist_name_hi text;       -- exact Hindi spelling of the artist's name
alter table "Entries" add column if not exists contributor_name_hi text;  -- exact Hindi spelling of who shared it
alter table "Entries" add column if not exists source_name_hi text;       -- exact Hindi spelling of who told it
alter table "Entries" add column if not exists translator_name_hi text;   -- exact Hindi spelling of the translator
-- (translation_hi, from the earlier setup, holds the Hindi meaning.)

-- 2) The Submit form can now send a translator for songs
alter table public.submissions add column if not exists translator_name text;

-- 3) OPTIONAL: tidy the credits of the two songs. The site already reads the old text correctly;
--    this just moves each name into its own box. Only changes rows that have no artist yet.
update "Entries" set artist_name = 'Loki Verma', translator_name = 'Pranjal Singh', contributor_name = 'Pranjal Singh'
  where title = 'बांका मुलक' and artist_name is null;
update "Entries" set artist_name = 'Mohit Chauhan', translator_name = 'Pranjal Singh', contributor_name = 'Pranjal Singh'
  where title = 'पूछे अम्मा मेरी' and artist_name is null;

-- =====================================================================
-- HOW TO ADD HINDI TO AN ENTRY
-- In Supabase you can simply open Table Editor > Entries and type into the Hindi columns.
-- Or copy this pattern, change the title and the text, and run it:
--
--   update "Entries"
--      set translation_hi = 'हिंदी में मतलब',
--          description_hi = 'विवरण (पकवान के लिए)',
--          recipe_hi      = 'विधि (पकवान के लिए)'
--    where title = 'सिड्डू';
--
-- Names are shown in Hindi automatically (approximately). To control the exact spelling, fill
-- artist_name_hi, contributor_name_hi, source_name_hi or translator_name_hi.
-- =====================================================================
