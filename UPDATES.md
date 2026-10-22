# PASCONX LMS — Latest Updates

## 1. Single device login (students)
- Ek student ek time pe sirf EK device pe logged in reh sakta hai. Login ke time dusra login **block** (409).
- Tab band / laptop off ho jaye to lock `SESSION_STALE_SECONDS` (default 180 sec) baad khud khul jata hai.
- Admin: Students page -> orange "logout" button = force logout / lock release.
- Admin accounts locked nahi hote (admin kabhi atak na jaye).
- Emergency off switch: env `SINGLE_SESSION=off`.

## 2. Desktop only
- Phone / tablet pe poora portal band — sirf "Laptop / Desktop Only" screen dikhti hai.
- Server bhi student login pe mobile user-agent reject karta hai.

## 3. Recorded Videos (student)
- Navbar -> "Recorded Videos": sab enrolled courses ki recordings ek jagah, newest first, search + course filter.

## 4. Admin: Any Video Link
- Admin -> Videos -> Add Video -> **Any Video Link**.
- Paste: YouTube / Google Drive / Vimeo / Loom / direct .mp4 / .m3u8 / koi bhi https link / `<iframe>` embed code.
- Student pe watermark overlay lagta hai.

## Deploy steps (ORDER IMPORTANT)
1. Supabase Dashboard -> SQL Editor -> `supabase/migrations/002_single_session_and_link_videos.sql` paste -> Run.
2. Code push karo -> Vercel redeploy.
3. (SQLite local) server restart karo — migration auto hoti hai.

## Tests
- `cd server && npm run test:session`  (15 new tests)
