# Deploy Staging

Trigger a Netlify build for the `main` branch to deploy to the staging site (ledgertc.co).

## Steps

1. First, run `git fetch origin` to get the latest remote state.

2. Check if the local `main` branch is in sync with `origin/main`. Run:
   ```
   git rev-parse main
   git rev-parse origin/main
   git log origin/main --not main --oneline
   git log main --not origin/main --oneline
   ```

3. Handle each scenario:

   **If remote has commits you don't have locally:**
   - List those commits and explain that the staging build will include them since Netlify builds from the remote.
   - Give two options:
     1. **Stop and examine** — run `git diff main..origin/main` to show what changed, then stop. Do NOT build or pull. Let the user review and decide their next step.
     2. **Proceed anyway** — trigger the build as-is. The remote commits will be included.

   **If you have local commits not yet pushed:**
   - Push to origin/main first, then proceed to trigger the build.

   **If both** (remote has commits AND you have unpushed commits):
   - Warn about both issues. Recommend stopping to examine and resolve before building.

   **If in sync:**
   - Confirm local and remote are identical and proceed to step 4.

4. After the user confirms, trigger the Netlify build:
   ```
   curl -X POST https://api.netlify.com/build_hooks/69dfb20f4482cf37140d9de8
   ```

5. Confirm to the user that the staging build has been triggered and they can check ledgertc.co in a few minutes.
