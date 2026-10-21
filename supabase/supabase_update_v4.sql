-- Adds a place for videos on an entry, and adds the culture entry "Nati" (with its two videos).
-- Safe to run again. (You should still run supabase_setup_v2.sql once: it creates the table the Submit form sends to.)
--
-- BEFORE this works on the live site, the four Nati files must be uploaded to GitHub (they are in the "UPLOAD" zip):
--   images/culture/nati-1.mp4   images/culture/nati-2.mp4   images/culture/nati-1.webp   images/culture/nati-2.webp
-- The entry points at those files, so nothing needs to go into Supabase Storage.

-- (these lines add every column this file uses, so it works even if the earlier setup files have not been run)
alter table "Entries" add column if not exists image_url text;
alter table "Entries" add column if not exists video_url text;
alter table "Entries" add column if not exists translation_hi text;
alter table "Entries" add column if not exists dialect text;
alter table "Entries" add column if not exists contributor_name text;
alter table "Entries" add column if not exists status text;

-- 1) if Nati is already in the table, refresh it
update "Entries"
set translation = $d$Nati is the folk dance of Himachal Pradesh, danced in a circle with linked hands at weddings, fairs and festivals, to the beat of drums and the sound of pipes. Every part of the state has its own style, with its own steps, songs and costume: Kullvi, Mahasuvi, Sirmauri, Kinnauri, Lahauli, Gaddi and more. Together they make one dance that brings the whole of Himachal together.

In 2015, 9,892 dancers performed Nati at Kullu, in traditional dress, a world record for the largest folk dance. These videos show Nati danced in the streets in traditional dress, under strings of colourful flags.$d$,
    translation_hi = $d$नाटी हिमाचल प्रदेश का लोकनृत्य है, जो शादियों, मेलों और त्योहारों में ढोल की थाप और शहनाई की धुन पर हाथ पकड़कर गोल घेरे में नाचा जाता है। राज्य के हर इलाक़े की अपनी शैली है, अपने क़दम, अपने गीत और अपनी पोशाक के साथ: कुल्लवी, महासुवी, सिरमौरी, किन्नौरी, लाहौली, गद्दी और भी कई। मिलकर ये एक ऐसा नृत्य बनाते हैं जो पूरे हिमाचल को एक साथ लाता है।

2015 में कुल्लू में 9,892 नर्तकों ने पारंपरिक पोशाक में नाटी की, जो सबसे बड़े लोकनृत्य का विश्व रिकॉर्ड है। ये वीडियो गलियों में पारंपरिक पोशाक में, रंग-बिरंगी झंडियों की लड़ियों के नीचे नाची जा रही नाटी दिखाते हैं।$d$,
    district = 'All',
    dialect = 'Dance, Folk',
    image_url = 'images/culture/nati-1.webp',
    video_url = 'images/culture/nati-1.mp4|images/culture/nati-2.mp4'
where title = 'नाटी' and type = 'Culture';

-- 2) if it is not there yet, add it
insert into "Entries" (title, transliteration, translation, translation_hi, district, type, dialect, contributor_name, image_url, video_url, status)
select 'नाटी', 'Nati',
  $d$Nati is the folk dance of Himachal Pradesh, danced in a circle with linked hands at weddings, fairs and festivals, to the beat of drums and the sound of pipes. Every part of the state has its own style, with its own steps, songs and costume: Kullvi, Mahasuvi, Sirmauri, Kinnauri, Lahauli, Gaddi and more. Together they make one dance that brings the whole of Himachal together.

In 2015, 9,892 dancers performed Nati at Kullu, in traditional dress, a world record for the largest folk dance. These videos show Nati danced in the streets in traditional dress, under strings of colourful flags.$d$,
  $d$नाटी हिमाचल प्रदेश का लोकनृत्य है, जो शादियों, मेलों और त्योहारों में ढोल की थाप और शहनाई की धुन पर हाथ पकड़कर गोल घेरे में नाचा जाता है। राज्य के हर इलाक़े की अपनी शैली है, अपने क़दम, अपने गीत और अपनी पोशाक के साथ: कुल्लवी, महासुवी, सिरमौरी, किन्नौरी, लाहौली, गद्दी और भी कई। मिलकर ये एक ऐसा नृत्य बनाते हैं जो पूरे हिमाचल को एक साथ लाता है।

2015 में कुल्लू में 9,892 नर्तकों ने पारंपरिक पोशाक में नाटी की, जो सबसे बड़े लोकनृत्य का विश्व रिकॉर्ड है। ये वीडियो गलियों में पारंपरिक पोशाक में, रंग-बिरंगी झंडियों की लड़ियों के नीचे नाची जा रही नाटी दिखाते हैं।$d$,
  'All', 'Culture', 'Dance, Folk', 'Himachali Roots', 'images/culture/nati-1.webp', 'images/culture/nati-1.mp4|images/culture/nati-2.mp4', 'approved'
where not exists (select 1 from "Entries" where title = 'नाटी' and type = 'Culture');

-- To add a video to any other entry later: upload it to GitHub (for example images/culture/mydance.mp4) and run
--   update "Entries" set video_url = 'images/culture/mydance.mp4' where title = '...' and type = '...';
-- (several videos in one cell are separated with |)
