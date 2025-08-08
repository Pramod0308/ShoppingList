# Shopping List (Web + Firebase)

A deployable, collaborative shopping list web app (PWA). Works on any phone via the browser.
- Real-time sync (Cloud Firestore)
- Anonymous sign-in
- Per-item Created/Updated timestamps
- Shareable link (?list=ID) for collaboration
- Offline-ready (Service Worker)

## Quick deploy
1) Create a Firebase project → Firestore (test mode for dev).
2) In Project settings → General → Web app → copy the config.
3) Duplicate `firebase-config.example.js` to `firebase-config.js` (gitignored) and replace the placeholder values with your project's config.
   - Never commit the real keys; keep `firebase-config.js` local or load values from environment variables at build time (e.g. via a `.env` file).
4) Deploy the folder anywhere (Netlify Drop, Vercel, Firebase Hosting).

### Firebase Hosting (one-time setup)
```bash
npm i -g firebase-tools
firebase login
firebase init hosting     # choose this folder as public directory, single-page app: N
firebase deploy
```

### Netlify (drag-and-drop)
- Go to app.netlify.com → Sites → **Drag & drop** this folder.

### Vercel
- vercel.com → New Project → Import → set the project to a static site.

## Security note
This sample uses *link-based collaboration* (anyone with the link can edit). For stricter access (members-only),
add a `members` subcollection and Firestore Security Rules to check membership before writes.

## GitHub Pages Deployment

1) Create a new GitHub repo and push these files.
2) In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: main, Folder: /(root)**, then Save.
3) Wait 1–2 minutes. Your site will be available at:
   `https://<username>.github.io/<repo>/`
4) In **Firebase Console → Authentication → Settings → Authorized domains**, add:
   `your-username.github.io`
5) Share the link above. Collaboration works via the `?list=...` parameter.
