# 9th Annual PSU Golf Trip — setup guide

This is a Next.js app backed by Supabase (real database + photo storage).
Follow these steps in order — total time is about 15 minutes.

## 1. Create the Supabase project

1. Go to https://supabase.com, sign in, click **New project**.
2. Name it anything (e.g. "psu-golf-trip"), pick a region close to you, set a database password (save it somewhere, you won't need it again for this app).
3. Wait ~2 minutes for it to finish provisioning.

## 2. Run the database schema

1. In your new Supabase project, go to **SQL Editor** (left sidebar) > **New query**.
2. Open `supabase/schema.sql` from this folder, copy all of it, paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned."
4. Go to **Storage** (left sidebar) and confirm a bucket named `photos` exists and is marked Public. (The SQL script creates it, but if it's missing, create it manually: New bucket > name `photos` > toggle Public on.)

## 3. Get your API keys

1. In Supabase, go to **Project Settings** (gear icon) > **API**.
2. Copy the **Project URL** and the **anon public** key. You'll need both in step 5.

## 4. Push this code to GitHub

1. Create a new empty repository on GitHub (no README, no .gitignore — this folder already has them).
2. From this folder, run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

## 5. Deploy on Vercel

1. Go to https://vercel.com, sign in, click **Add New > Project**.
2. Import the GitHub repo you just pushed.
3. Before deploying, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key from step 3
4. Click **Deploy**. In about a minute you'll get a live URL like `psu-golf-trip.vercel.app`.

## 6. Send that link to the guys

That Vercel URL is the one link everyone uses all weekend. No login, no install —
just open it. Scores, chat, photos, and expenses are all shared live through Supabase.

## Editing the roster later

Handicaps default to 0 and 2v2 teams default to A/A/B/B in player order — go to
**Home > Edit groups & players** in the app itself to fix both before the trip.

## If something looks wrong

- Blank page / console errors about Supabase: double-check the two environment
  variables in Vercel are exactly right, then redeploy (Vercel > Deployments > ⋯ > Redeploy).
- Photos not uploading: confirm the `photos` bucket in Supabase Storage is set to Public.
