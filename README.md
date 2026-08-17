# CV Suite — Free Version (The Cache Group)

AI career tools built on Next.js 14 and the Anthropic API (Claude Haiku 4.5), deployed on Vercel.

Users enter an email address, receive a set number of free generations, and are told how
many they have left after each one. When they run out they are pointed at
`careers@thecachegroup.com.au` to ask for more.

## Tools

| Tool | What it produces |
|------|------------------|
| Tailored CV | Full ATS-safe CV rewritten against a specific job ad |
| Cover Letter | Targeted letter, requirement by requirement |
| Interview Prep | 1–2 pages: the 8 behavioural questions most likely to be asked, and what to draw on from the candidate's own CV for each |

CV and job advertisement are **required** for every tool — enforced in the browser and again
on the server, so the model always has real material to work from. Company name is optional
on Interview Prep, and when supplied is used as a name only. The tool never describes a
company it has not researched.

---

## Setup

### 1. Create the GitHub repository

1. Go to github.com → **New repository**
2. Name it `CV-Suite-Free`, set it to **Private**, click **Create repository**
3. On the next screen click **uploading an existing file**
4. Drag in the contents of this folder (the files inside it, not the folder itself)
5. Click **Commit changes**

Do not upload `node_modules` or `.next` if you have run the project locally. The included
`.gitignore` covers this.

### 2. Import into Vercel

1. vercel.com → **Add New** → **Project**
2. Import the `CV-Suite-Free` repository
3. Do not deploy yet — add the storage and environment variables first

### 3. Add the Redis store

This is what records email addresses and counts usage. Without it the app still runs, but
nothing is recorded and nobody is limited.

1. In your Vercel project, open the **Storage** tab
2. Click **Create Database** → **Marketplace** → **Upstash for Redis**
3. Choose the free plan, pick a region close to Australia (Sydney or Singapore)
4. Click **Connect to Project** and select this project

Vercel adds the connection details automatically. You do not need to copy anything by hand.

> Vercel KV no longer exists as a separate product — it was folded into Upstash in
> December 2024. Upstash *is* the current Vercel Redis option.

### 4. Add environment variables

Vercel → your project → **Settings** → **Environment Variables**. Add each of these:

| Name | Value | Required |
|------|-------|----------|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com | Yes |
| `RESEND_API_KEY` | Your key from resend.com | Yes |
| `ADMIN_KEY` | A long random password you invent | Yes |
| `NOTIFY_EMAIL` | Your email, for new-signup alerts | Optional |
| `FREE_USES` | Number of free generations, default `10` | Optional |
| `DAILY_IP_LIMIT` | Daily cap per connection, default `25` | Optional |

Then click **Deploy**.

### 5. Turn off Vercel login protection

Otherwise visitors are asked to log into Vercel before they see anything.

1. Vercel → your project → **Settings** → **Deployment Protection**
2. Set **Vercel Authentication** to **Off**
3. Save, then redeploy

### 6. Share the URL

Anyone with the link can use it. They enter an email, get their free generations, and are
counted down from there.

---

## Seeing who has signed up

Open this in your browser, replacing `YOUR_ADMIN_KEY` with the value you set:

```
https://your-app.vercel.app/api/admin?key=YOUR_ADMIN_KEY
```

This downloads a CSV of every email address, how many generations they have used, and when
they first and last used the tools. It opens straight in Excel.

To see it on screen instead of downloading:

```
https://your-app.vercel.app/api/admin?key=YOUR_ADMIN_KEY&format=json
```

### Giving someone more uses

When somebody emails asking for more, open this:

```
https://your-app.vercel.app/api/admin?key=YOUR_ADMIN_KEY&grant=their@email.com
```

That resets them to the standard allowance. To give a specific number instead:

```
https://your-app.vercel.app/api/admin?key=YOUR_ADMIN_KEY&grant=their@email.com&uses=20
```

No redeploy needed — it takes effect immediately.

---

## How usage limiting works

- Each email address gets `FREE_USES` generations (10 by default), shared across all three tools
- A use is **reserved before** the model runs, so nobody can cancel at the last second and keep the output for free
- A use is **refunded** if the generation fails or is cut short — see below
- A daily per-connection cap (`DAILY_IP_LIMIT`) stops one person cycling through throwaway addresses
- The email address is not verified. This is deliberate: it is a lead capture with a speed
  bump attached, not a security control. Anyone determined enough will get past it. The
  point is that most people will not bother, and the ones who ask for more become a conversation.

## Truncation protection

The most common failure in earlier versions was a CV that stopped halfway through and was
handed to a candidate looking finished but broken. Three things now prevent that:

1. **Generous output ceilings** — 16,000 tokens for a tailored CV, well past what any real CV needs
2. **Five-minute function limit** — the Vercel Hobby maximum, so long generations are not cut off by a timeout
3. **Detection and refund** — if the model does hit its ceiling, the app shows a clear warning that the output is incomplete and does not count the generation against the user's allowance

---

## Notes

- Nothing a user pastes is stored. Only the email address, usage count and timestamps are kept.
- The contact form is capped at 5 messages per connection per day.
- Output downloads as a formatted `.docx` in Cache Group burgundy.
- Costs roughly $0.002 per generation on Haiku.

## Project structure

```
app/
  page.tsx              Single-page UI: email gate, tools, output
  layout.tsx
  api/
    access/route.ts     Registers an email, returns remaining uses
    generate/route.ts   Access check, input floor, streaming generation
    admin/route.ts      CSV export and use grants (ADMIN_KEY protected)
    contact/route.ts    Contact form → Resend
    extract/route.ts    .txt / .docx / .pdf text extraction
    docx/route.ts       Formatted Word download
lib/
  prompts.ts            All three system prompts
  store.ts              Redis: email records, usage counting, limits
  ip.ts                 Client IP behind the Vercel proxy
```
