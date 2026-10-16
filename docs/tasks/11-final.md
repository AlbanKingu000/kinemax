# Task 11: final security review, production readiness, cleanup, README, v1.0.0 (lean)

Resume rule: continue from the first unchecked item. Decisions are listed in the final report and
in docs/security.md.

- [x] 1a route inventory test (auth, admin, CSRF, validation, rate limits)
- [x] 1b rate limits on auth, hold, checkout, payment, cancel, check-in, admin writes
- [x] 1c production security headers (CSP, frame-ancestors, Referrer-Policy, HSTS, nosniff)
- [x] 1d greps: raw SQL, dangerouslySetInnerHTML, eval, secrets, logs, stack traces
- [x] 1e open redirect, session fixation, IDOR, uploads, check-in scope
- [x] 1f audit gate + dependency review
- [x] 1 docs/security.md + commit
- [x] 2a production env validation (APP_ORIGIN https, CSRF_SECRET, DATABASE_URL, UPLOADS_DIR)
- [x] 2b production start (API serves the built web app) verified locally
- [x] 2c docs/deployment.md + commit
- [x] 3a unused files, scripts, dependencies, dead code, TODOs
- [x] 3b .gitignore
- [x] 3c dev database reset (approved)
- [x] 3 commit
- [x] 4 README with screenshots + commit
- [x] 5 verify, roadmap, commit, tag v1.0.0, push
