# Contributing

Use Node.js 22.18+ and npm:

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
npm run dev
```

Open http://localhost:5173. Webcam use requires camera permission. Automated and synthetic tests do not establish real-person tracking accuracy or clinical validity.

For pull requests, explain the user-facing problem and include relevant test results. Preserve local processing, backup compatibility, incomplete-session handling, and the distinction between task measurements and tracking quality. Do not add unsupported diagnostic or treatment claims.

Use synthetic test inputs. Never commit personal backups, camera recordings, credentials, or browser data. Report bugs with browser/OS, reproduction steps, and redacted diagnostics. Discuss large changes in GitHub issues first.
