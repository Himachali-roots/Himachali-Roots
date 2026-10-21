-- Adds (or refreshes) the phrase "Ghaur auṇā" and the culture entry "Dhaam". Run AFTER supabase_setup_v2.sql.
-- Safe to run again: it updates the entries if they are already there, and adds them if they are not.

alter table "Entries" add column if not exists translation_hi text;

-- ---------- Phrase ----------
insert into "Entries" (title, transliteration, translation, translation_hi, district, type, dialect, contributor_name, status)
select 'घौर औणा', 'Ghaur auṇā', 'Come to our home', 'हमारे घर आओ।', 'All', 'Phrase', 'Family, Greeting', 'Himachali Roots', 'approved'
where not exists (select 1 from "Entries" where title = 'घौर औणा' and type = 'Phrase');

-- ---------- Culture: Dhaam ----------
-- 1) if Dhaam is already in the table, replace its text with this version
update "Entries"
set translation = $d$Dhaam is the festive feast of Himachal Pradesh, served at weddings, festivals and religious gatherings. More than a meal, it brings people together through food. The best known are the Kangri Dhaam and the Mandyali Dhaam.

Dhaam is cooked by traditional cooks called Botis, in huge copper or brass vessels over wood fires, in deep trenches.

Everyone is served together, sitting equally on the ground in rows, on traditional leaf plates called pattals.$d$,
    district = 'All',
    dialect = 'Food, Gathering'
where title = 'धाम' and type = 'Culture';

-- 2) if it is not there yet, add it
insert into "Entries" (title, transliteration, translation, district, type, dialect, contributor_name, status)
select 'धाम', 'Dhaam',
  $d$Dhaam is the festive feast of Himachal Pradesh, served at weddings, festivals and religious gatherings. More than a meal, it brings people together through food. The best known are the Kangri Dhaam and the Mandyali Dhaam.

Dhaam is cooked by traditional cooks called Botis, in huge copper or brass vessels over wood fires, in deep trenches.

Everyone is served together, sitting equally on the ground in rows, on traditional leaf plates called pattals.$d$,
  'All', 'Culture', 'Food, Gathering', 'Himachali Roots', 'approved'
where not exists (select 1 from "Entries" where title = 'धाम' and type = 'Culture');

-- ---------- OPTIONAL (remove the two dashes at the start of each line to use) ----------
-- A draft Hindi version of the Dhaam text. Please replace it with your own wording.
--
-- update "Entries"
-- set translation_hi = $d$धाम हिमाचल प्रदेश की त्योहारी दावत है, जो शादियों, त्योहारों और धार्मिक आयोजनों में परोसी जाती है। यह सिर्फ़ एक भोजन नहीं, खाने के ज़रिए लोगों को जोड़ने वाली परंपरा है। सबसे मशहूर हैं कांगड़ी धाम और मंडयाली धाम।

-- धाम को बोटी कहे जाने वाले पारंपरिक रसोइये तांबे या पीतल के विशाल बर्तनों में, ज़मीन में खुदी गहरी खाइयों में जलती लकड़ी की आग पर पकाते हैं।

-- सब लोग एक साथ, बराबरी से ज़मीन पर कतार में बैठते हैं, और पारंपरिक पत्तल पर खाना परोसा जाता है।$d$
-- where title = 'धाम' and type = 'Culture';
--
-- When you have a photograph: upload it in Supabase > Storage > Pictures, click the file, copy its link, and run
--   update "Entries" set image_url = 'PASTE-THE-LINK-HERE' where title = 'धाम' and type = 'Culture';
