# AuditFlow department app prototype

Open `index.html` in a modern browser, or publish the files with GitHub Pages.

The prototype uses the supplied audit matrix as sample data and includes:

- Dashboard metrics and visualisations calculated from the register
- Search, filters, editable matter details, and new-matter entry
- Internal Auditor, Senior Accounts Officer, and Permanent Secretary roles
- Follow-up and implementation monitoring
- Monthly report generation, print/PDF preview, Word export, and submission history
- Browser storage for demo mode
- Firebase-ready live saving for shared department updates

## Live shared saving

The app now includes a Firebase adapter. It runs in local demo mode until `firebase-config.js` is completed.

To enable live saving:

1. Create a Firebase project.
2. Enable Firestore Database.
3. Add a Firebase Web app.
4. Paste the Firebase config into `firebase-config.js`.
5. Change `enabled` to `true`.

See `FIREBASE_SETUP.md` for details.

Do not enter confidential audit information until Firebase Authentication and Firestore security rules are configured.
