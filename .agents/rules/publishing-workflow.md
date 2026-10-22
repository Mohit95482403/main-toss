# DADDY TOSS BOOK — Development & Publishing Protocol

For all DADDY TOSS BOOK tasks, strictly follow this publishing workflow:

1. **Complete Requested Changes**: Complete the requested code changes accurately and concisely.
2. **Preserve Integrity**: Inspect all modified files and preserve existing functionality, styling, and routes.
3. **Pre-Publish Audit**: Run `npm run pre-publish` (verifies branch is `main`, zero secrets staged, syntax valid, endpoints correct).
4. **Syntax & Tests**: Run `node scripts/syntax-check.js` and any relevant test suites.
5. **Diff & Secret Review**: Inspect `git diff` and staged files for secrets, environment files, unrelated changes, and accidental deletions.
6. **Report & Prepare Commit**: Report the files changed and prepare a clear, semantic commit message (e.g. `feat(...)`, `fix(...)`).
7. **Explicit User Approval Gate**: **NEVER** commit or push until the USER explicitly approves publishing.
8. **Commit & Push**: After explicit approval, commit the intended changes and push to `origin main` (`git push origin main`). Never force-push.
9. **Verify Push**: Confirm that the push succeeded and report the exact commit SHA.
10. **Verify Vercel Deployment**: Check the corresponding Vercel deployment status. Confirm it uses the expected commit and reaches Ready.
11. **Verify Render Deployment**: For backend changes, verify the Render service reaches Healthy/Ready.
12. **Honest Reporting**: Never claim the live website has been updated until deployment has been physically verified.
13. **Failure Remediation**: If deployment fails, report the actual error honestly and help resolve it.
14. **Security & Data Safety**: Never expose secrets, change production credentials, force-push, or run destructive database operations without explicit approval.

## Fixed Production Hosting Details:
- **GitHub Repository**: `Mohit95482403/main-toss`
- **Branch**: `main`
- **Frontend URL**: `https://daddy-toss-book.vercel.app/`
- **Backend URL**: `https://daddy-toss-book-backend.onrender.com`
- **Database**: Aiven MySQL (`daddy_toss_book`)
