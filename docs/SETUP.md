# Setting this up, once

Plain language. Do it once and never think about it again.

---

## 1. Put it on GitHub

**It has to be public.** A helper reading the repo has no login, so a private repo is invisible
to it. If any part of this shouldn't be public, keep that part out and hand it over as a file
instead.

- On github.com, make a new repository. Call it `opes-arx`. **Do not** tick "add a README",
  "add .gitignore", or "choose a licence" — the folder already has what it needs, and those
  options create a conflict you'd then have to untangle.
- On the page that appears, copy the block under *"…or push an existing repository"*.
- Unzip this folder somewhere sensible, open a terminal in it, and run:

```
git init
git add .
git commit -m "Opes Arx v0.47 — wound pool, played-out withdrawals, the ground and the firefight drawn"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/opes-arx.git
git push -u origin main
```

If it asks for a password, GitHub doesn't take passwords any more — it wants a **personal access
token**. Settings → Developer settings → Personal access tokens → Fine-grained → generate one
with write access to this repo, and paste that as the password. Your machine will remember it.

---

## 2. Put the demos on the web

Cloudflare Pages, free, and it re-publishes itself every time you push.

- Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
- Pick the `opes-arx` repo.
- On the build settings screen, the only thing that matters:
  - **Framework preset:** None
  - **Build command:** leave it completely empty
  - **Build output directory:** `viewers`
- Save and deploy.

You get a URL like `opes-arx.pages.dev`, and it opens the landing page listing every demo.
There's no build step because there's nothing to build — these are single self-contained HTML
files with the engine inlined. That is why this works with an empty build command, and it is
also why it will keep working.

---

## 3. The rhythm from then on

**When something changes on your machine:**

```
git add -A
git commit -m "what changed, in a sentence"
git push
```

The site updates itself a minute or so later.

**When you start a branch chat**, paste this and nothing else:

```
git clone https://github.com/YOUR-NAME/opes-arx.git
cd opes-arx/sim && node arx.cjs regress --fast
```

Then point it at its brief. No attachment, no re-packaging, and it starts from exactly what you
last pushed rather than from whatever zip was lying around.

**When a branch sends work back**, it hands you changed files. Drop them into your local folder,
then — *before committing* — run the gate:

```
cd sim
node arx.cjs regress --fast
node audit_open.cjs
node audit_docs.cjs
node audit_cross.cjs
```

If all four are clean and the viewers rebuild, commit it. If they aren't, that is the branch's
problem to fix and not yours to debug. **The suite is the merge protocol** — it is what lets you
accept work on the combat grid without having to reason about whether it disturbed sponsors.

---

## 4. Two branches at once

Only worth it if they touch different files. If both want `tactical.js`, run them one after the
other — merging two sets of edits to the same file by hand is exactly the kind of quiet mistake
that costs a week.

If you do want them in parallel, give each its own branch:

```
git checkout -b fog          # do the work, commit it
git checkout main
git merge fog
```

---

## 5. What this actually buys

- **A history.** "What changed since the last branch" becomes `git diff` instead of somebody
  remembering. Most of the wasted effort so far has been rediscovering what state things were in.
- **One document.** `PROJECT.md` lives in the repo, so every branch reads the same version.
- **Visible baselines.** Re-blessing the five fixed-seed fights is currently a silent numbers
  change buried in `arx.cjs`. As a commit it becomes something you can see and question later.
- **A link instead of a download.** The demos are one click, on any device, for anyone.

---

## 6. The one risk

A repo makes it *easier* for a helper to read more than it should, and reading too much is the
thing that has cost this project the most. **The "do not read these files" line in a brief is
doing more work than the list of what to read.** Keep it there.
