# Deploy Production

Merge `main` into `production` and push to trigger a Netlify build for the production site (ledgertc.com).

## Steps

1. Run `git fetch origin` to get the latest remote state.

2. Check that local `main` is in sync with `origin/main`:
   ```
   git rev-parse main
   git rev-parse origin/main
   ```
   - If they differ, warn the user and ask them to resolve before proceeding. Do NOT continue with a production deploy if local and remote main are out of sync.

3. Show the user what will be deployed — the commits on `main` that are not yet on `production`:
   ```
   git log origin/production..origin/main --oneline
   ```
   - If there are no new commits, tell the user there is nothing new to deploy and stop.
   - Otherwise, list the commits and ask the user to confirm they want to deploy these to production.

4. After the user confirms, merge and push:
   ```
   git checkout production
   git pull origin production
   git merge main
   git push origin production
   git checkout main
   ```

5. If the merge has conflicts, stop and alert the user. Do NOT force or auto-resolve conflicts.

6. Confirm to the user that production has been updated and Netlify will auto-build ledgertc.com.
