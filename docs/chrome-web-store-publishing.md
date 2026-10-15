# Publishing to the Chrome Web Store

Releases are automatic. Merge to `main`; when the push changes anything that ships in the
extension (`src/`, dependencies, build config), CI:

1. type-checks and tests the extension,
2. bumps the patch version past the last `v*` tag (0.0.3 → 0.0.4) in `package.json`,
   `package-lock.json` and `src/manifest.json`, adds a `CHANGELOG.md` section listing the commit
   subjects since that tag, and pushes that as a `chore(release): vX.Y.Z` commit,
3. builds the zip, tags `vX.Y.Z` and publishes a GitHub release with the changelog section as the notes,
4. uploads the zip to the Chrome Web Store and submits it for review.

A push that only touches docs, scripts or CI just refreshes the rolling `latest` build.
For a minor or major version, set it in `package.json` and `src/manifest.json` yourself
before merging (and write its `## X.Y.Z` changelog section if you want hand-written notes);
CI ships exactly that version instead of bumping. **Actions → Build and release → Run
workflow** with **release** cuts a new version even without code changes.

Step 4 needs store credentials, set up once as described below. Until then CI publishes
the GitHub release and leaves a warning that the store submission was skipped.

## One-time setup

You need the Google account that owns the store item, and `gh` signed in with access to this repository.

### 1. Create an OAuth client

In the [Google Cloud console](https://console.cloud.google.com/):

1. Create a project (or pick one), for example `meeting-transcript-cws`.
2. **APIs & Services → Library**: search for **Chrome Web Store API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**):
   - User type **External**, app name of your choice, your email as the support and developer contact.
   - Under **Audience**, add your own Google account as a test user.
   - Then click **Publish app** so the status is **In production**. While the app is in
     *Testing*, Google expires refresh tokens after 7 days and CI stops being able to publish.
     The app does not need to be verified for your own use; you will see an "unverified app"
     warning when signing in, which you can continue past.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   application type **Desktop app**. Copy the **client ID** and **client secret**.

### 2. Run the setup script

```bash
npm run cws:auth
```

Paste the client ID and secret when asked. A browser opens for Google sign-in; sign in with
the account that owns the store item and allow access. The script then:

- checks the credentials can read the store item,
- stores `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN` as repository secrets,
- sets the `CWS_EXTENSION_ID` repository variable.

Nothing is printed or saved to disk. Defaults target `numandev1/MeetingTranscriptToObsidian`
and item `fnaehffidleegibjekglaoehffkldmhc`; override with `--repo` and `--extension-id`.

### 3. Ship the first version

Open **Actions → Build and release → Run workflow**, tick **release**, and run it on `main`.
That cuts the next version and submits it. Later versions are submitted automatically when
they reach `main`; **submit_to_store** resubmits the current version without a new one.

## When a submission fails

| Error | Cause | Fix |
|---|---|---|
| `ITEM_NOT_UPDATABLE` | The previous version is still in review | Wait for the review to finish, then Run workflow with **submit_to_store** |
| `invalid_grant` | Refresh token expired or revoked, usually because the consent screen was left in *Testing* | Publish the consent screen to production, then run `npm run cws:auth` again |
| `PKG_INVALID_VERSION_NUMBER` | That version was already uploaded | Run workflow with **release** to cut the next one |

The GitHub release is published before the store step, so a store failure never blocks a release.
