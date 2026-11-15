-- =====================================================================
-- CHECK THE SUBMISSIONS TABLE (read-only: changes nothing, saves nothing)
-- Supabase > SQL Editor > New query. RUN ONE BLOCK AT A TIME (select the block, press Run).
-- =====================================================================

-- BLOCK 1: are all 23 columns the Submit form sends in the table?  Must say OK.
select case when count(*) = 0 then 'OK: the submissions table has all 23 columns the Submit form sends'
            else 'STILL MISSING: ' || string_agg(c, ', ') end as submissions_table_check
from unnest(array['type', 'district', 'dialect', 'village', 'title', 'title_roman', 'original_text', 'transliteration', 'translation', 'translation_hi', 'context', 'description', 'recipe', 'artist_name', 'translator_name', 'source_name', 'tags', 'audio_url', 'image_url', 'contributor_name', 'contributor_email', 'contributor_connection', 'status']) as c
where c not in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'submissions');

-- BLOCK 2: what a visitor may do.  visitors_can_send must be true, visitors_can_read_them must be false.
select has_table_privilege('anon', 'public.submissions', 'insert') as visitors_can_send,
       has_table_privilege('anon', 'public.submissions', 'select') as visitors_can_read_them;

-- BLOCK 3: send a TEST submission exactly as a visitor's browser would, then undo it (nothing is saved).
-- It should finish with "INSERT 0 1" and no error. An error here is the same error your visitors would see.
begin;
set local role anon;
insert into public.submissions (type, district, title, title_roman, original_text, transliteration, translation, tags, contributor_name, status)
values ('Story', 'Mandi, Kullu', 'परीक्षा', 'Test', 'परीक्षा', 'Test', 'A test story', 'Riddle', 'Test', 'pending');
rollback;
