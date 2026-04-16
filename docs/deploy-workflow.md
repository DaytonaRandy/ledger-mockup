# Deploy Workflow

## What changed

- **Auto-builds on staging (ledgertc.co) are now disabled.** Pushing to `main` no longer triggers a Netlify build. This prevents burning through build credits when multiple sessions push frequently.
- **Production (ledgertc.com) is unchanged.** It still auto-builds when `production` branch is updated.
- Two new Claude Code slash commands handle deploys.

## Setup

**Just pull the latest main.** That's it — the commands are in the repo.

```bash
git pull origin main
```

## Commands

### `/deploy-staging`
Deploys `main` to **ledgertc.co** (staging).

- Checks if your local branch is in sync with remote
- Warns you if there are commits on remote you don't have, or unpushed local commits
- Triggers the Netlify build hook

### `/deploy-production`
Deploys `main` to **ledgertc.com** (production).

- Checks local/remote sync (blocks if out of sync)
- Shows you exactly which commits will go live
- Asks for confirmation
- Merges `main` → `production` and pushes

## Workflow

```
localhost (preview every change)
  → push to main freely (no build cost)
  → /deploy-staging (when ready to check staging)
  → check ledgertc.co
  → /deploy-production (when ready to go live)
  → ledgertc.com updates
```

## Notes

- Push to `main` as often as you want — no builds are triggered.
- Only `/deploy-staging` triggers a staging build (via build hook).
- The `netlify.toml` ignore command skips git-push builds but build hooks bypass it.
- If you're running multiple Claude Code sessions, each can push freely. Run `/deploy-staging` once when you're done to build everything at once.
