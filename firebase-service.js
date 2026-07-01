(() => {
  "use strict";

  const SDK_VERSION = "10.12.5";

  const state = {
    enabled: false,
    ready: false,
    mode: "local",
    message: "Local browser demo",
    app: null,
    db: null,
    auth: null,
    provider: null,
    user: null,
    docRef: null,
    modules: null,
    unsubscribe: null
  };

  function configBlock() {
    return window.AUDITFLOW_FIREBASE_CONFIG || {};
  }

  function hasConfig() {
    const config = configBlock();
    const firebaseConfig = config.firebaseConfig || {};
    return Boolean(
      config.enabled &&
        firebaseConfig.apiKey &&
        firebaseConfig.projectId &&
        firebaseConfig.appId
    );
  }

  async function loadFirebaseModules() {
    if (state.modules) return state.modules;

    const [app, firestore, auth] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`)
    ]);

    state.modules = { app, firestore, auth };
    return state.modules;
  }

  async function ensureFirebase() {
    if (!hasConfig()) return false;
    if (state.app && state.db && state.auth && state.docRef) return true;

    const config = configBlock();
    const collections = config.collections || {};
    const modules = await loadFirebaseModules();
    const app = modules.app.getApps().length
      ? modules.app.getApp()
      : modules.app.initializeApp(config.firebaseConfig);
    const db = modules.firestore.getFirestore(app);
    const auth = modules.auth.getAuth(app);
    const provider = new modules.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.useDeviceLanguage?.();
    await modules.auth.setPersistence(auth, modules.auth.browserLocalPersistence).catch(() => {});

    state.enabled = true;
    state.mode = "firebase";
    state.app = app;
    state.db = db;
    state.auth = auth;
    state.provider = provider;
    state.docRef = modules.firestore.doc(
      db,
      collections.stateDocPath || "auditflow/state"
    );

    return true;
  }

  function userSummary(user) {
    if (!user) return null;
    return {
      email: user.email || "",
      name: user.displayName || "",
      uid: user.uid || ""
    };
  }

  function status() {
    return {
      enabled: state.enabled,
      ready: state.ready,
      mode: state.mode,
      message: state.message,
      user: userSummary(state.user)
    };
  }

  function waitForAuthReady(auth, timeoutMs = 1500) {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (user) => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        window.clearTimeout(timer);
        resolve(user || null);
      };

      const unsubscribe = state.modules.auth.onAuthStateChanged(auth, finish);
      const timer = window.setTimeout(() => finish(auth.currentUser), timeoutMs);
    });
  }

  function describeError(error) {
    const code = error?.code || "";
    if (code.includes("permission-denied")) {
      return "Signed in, but this Google account is not on the AuditFlow access list yet.";
    }
    if (code.includes("popup-blocked")) {
      return "Google sign-in popup was blocked. Please allow pop-ups for this dashboard, then try again.";
    }
    if (code.includes("popup-closed-by-user")) {
      return "Google sign-in was closed before live saving connected. Please try again.";
    }
    if (code.includes("unauthorized-domain")) {
      return "This website domain is not authorised for Google sign-in yet.";
    }
    if (code.includes("operation-not-supported") || code.includes("web-storage-unsupported")) {
      return "This browser cannot complete Google sign-in here. Please open the shared dashboard link in Chrome or Microsoft Edge.";
    }
    return `Firebase connection failed: ${error?.message || "Unknown error"}`;
  }

  async function signIn() {
    if (!(await ensureFirebase())) {
      state.message = "Firebase is not configured; live saving is unavailable.";
      return status();
    }

    try {
      state.message = "Opening Google sign-in popup...";
      const result = await state.modules.auth.signInWithPopup(
        state.auth,
        state.provider
      );
      state.user = result.user || state.auth.currentUser;
      state.message = state.user
        ? `Signed in as ${state.user.email || state.user.displayName || "Google user"}.`
        : "Signed in with Google.";
      return status();
    } catch (error) {
      state.ready = false;
      state.mode = "signin";
      state.message = describeError(error);
      throw error;
    }
  }

  async function init({ seedRecords = [], seedReportHistory = [] } = {}) {
    if (!(await ensureFirebase())) {
      state.enabled = false;
      state.ready = false;
      state.mode = "local";
      state.message = "Firebase is not configured; using local browser demo data.";
      return status();
    }

    try {
      const user = await waitForAuthReady(state.auth);

      if (!user) {
        state.ready = false;
        state.mode = "signin";
        state.message = "Sign in with Google to connect live shared data. If this opens in the Codex in-app browser, use Chrome or Edge for the final shared link.";
        return status();
      }

      state.user = user;
      const firestore = state.modules.firestore;
      const existing = await firestore.getDoc(state.docRef);

      if (!existing.exists()) {
        await firestore.setDoc(state.docRef, {
          records: seedRecords,
          reportHistory: seedReportHistory,
          createdAt: firestore.serverTimestamp(),
          updatedAt: firestore.serverTimestamp(),
          updatedBy: user.email || user.displayName || "Initial signed-in user",
          source: "AuditFlow GitHub Pages"
        });
      }

      state.enabled = true;
      state.ready = true;
      state.mode = "firebase";
      state.message = `Live data connected as ${user.email || user.displayName || "Google user"}.`;
      return status();
    } catch (error) {
      state.ready = false;
      state.mode = "error";
      state.message = describeError(error);
      return status();
    }
  }

  function subscribe(onData, onError) {
    if (!state.ready || !state.docRef) return () => {};
    if (state.unsubscribe) state.unsubscribe();

    state.unsubscribe = state.modules.firestore.onSnapshot(
      state.docRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        onData({
          records: Array.isArray(data.records) ? data.records : [],
          reportHistory: Array.isArray(data.reportHistory) ? data.reportHistory : [],
          updatedBy: data.updatedBy || "",
          updatedAt: data.updatedAt || null
        });
      },
      (error) => {
        state.message = `Live sync stopped: ${error.message}`;
        onError?.(error);
      }
    );

    return state.unsubscribe;
  }

  async function saveAll(records, reportHistory, context = {}) {
    if (!state.ready || !state.docRef) return false;
    const firestore = state.modules.firestore;
    const role = context.role || "Unknown role";
    const action = context.action || "Updated AuditFlow data";
    const user = state.user || state.auth?.currentUser;

    await firestore.setDoc(
      state.docRef,
      {
        records,
        reportHistory,
        updatedAt: firestore.serverTimestamp(),
        updatedBy: user?.email || role,
        updatedByRole: role,
        lastAction: action
      },
      { merge: true }
    );

    await writeAuditLog({
      action,
      role,
      userEmail: user?.email || "",
      userName: user?.displayName || "",
      summary: context.summary || "",
      recordId: context.recordId || "",
      reportMonth: context.reportMonth || ""
    });
    return true;
  }

  async function writeAuditLog(entry) {
    if (!state.ready || !state.db) return false;
    const firestore = state.modules.firestore;
    const collections = configBlock().collections || {};
    const auditLogCollection = collections.auditLog || "auditflowAuditLog";
    await firestore.addDoc(firestore.collection(state.db, auditLogCollection), {
      ...entry,
      createdAt: firestore.serverTimestamp()
    });
    return true;
  }

  window.AuditFlowBackend = {
    init,
    status,
    signIn,
    subscribe,
    saveAll,
    writeAuditLog
  };
})();