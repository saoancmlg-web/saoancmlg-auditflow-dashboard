(() => {
  "use strict";

  const SDK_VERSION = "10.12.5";

  const state = {
    enabled: false,
    ready: false,
    mode: "local",
    message: "Local browser demo",
    db: null,
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
    const [app, firestore] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);
    return { app, firestore };
  }

  function status() {
    return {
      enabled: state.enabled,
      ready: state.ready,
      mode: state.mode,
      message: state.message
    };
  }

  async function init({ seedRecords = [], seedReportHistory = [] } = {}) {
    if (!hasConfig()) {
      state.enabled = false;
      state.ready = false;
      state.mode = "local";
      state.message = "Firebase is not configured; using local browser demo data.";
      return status();
    }

    try {
      const config = configBlock();
      const collections = config.collections || {};
      const modules = await loadFirebaseModules();
      const app = modules.app.initializeApp(config.firebaseConfig);
      const db = modules.firestore.getFirestore(app);
      const docPath = collections.stateDocPath || "auditflow/state";
      const docRef = modules.firestore.doc(db, docPath);
      const existing = await modules.firestore.getDoc(docRef);

      if (!existing.exists()) {
        await modules.firestore.setDoc(docRef, {
          records: seedRecords,
          reportHistory: seedReportHistory,
          createdAt: modules.firestore.serverTimestamp(),
          updatedAt: modules.firestore.serverTimestamp(),
          updatedBy: "System seed",
          source: "AuditFlow GitHub Pages"
        });
      }

      state.enabled = true;
      state.ready = true;
      state.mode = "firebase";
      state.message = "Connected to Firebase Firestore live data.";
      state.db = db;
      state.docRef = docRef;
      state.modules = modules;
      return status();
    } catch (error) {
      state.enabled = false;
      state.ready = false;
      state.mode = "local";
      state.message = `Firebase connection failed: ${error.message}`;
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

    await firestore.setDoc(
      state.docRef,
      {
        records,
        reportHistory,
        updatedAt: firestore.serverTimestamp(),
        updatedBy: role,
        lastAction: action
      },
      { merge: true }
    );

    await writeAuditLog({
      action,
      role,
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
    subscribe,
    saveAll,
    writeAuditLog
  };
})();