(() => {
  "use strict";

  const STORAGE_KEY = "auditflow.records.v1";
  const REPORTS_KEY = "auditflow.reports.v1";
  const RELOAD_FLAG = "auditflow.remoteReload.v1";
  const EDITING_GRACE_MS = 15000;

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  let liveReady = false;
  let applyingRemote = false;
  let connecting = false;
  let saveTimer = 0;
  let lastLocalWriteAt = 0;
  let pendingRemotePayload = null;

  const getService = () => window.AuditFlowBackend;

  function sampleRecords() {
    return Array.isArray(window.AUDITFLOW_SAMPLE_DATA)
      ? window.AUDITFLOW_SAMPLE_DATA.map((record) => ({ ...record }))
      : [];
  }

  function parseStorage(key, fallback) {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
      console.warn(`AuditFlow could not read ${key}`, error);
      return fallback;
    }
  }

  function currentRecords() {
    return parseStorage(STORAGE_KEY, sampleRecords());
  }

  function currentReportHistory() {
    return parseStorage(REPORTS_KEY, []);
  }

  function currentRole() {
    return document.querySelector('[data-change="role"]')?.value || "Browser user";
  }

  function showLiveBadge(message, mode = "local") {
    const existing = document.querySelector("[data-live-sync-badge]");
    const badge = existing || document.createElement("div");
    badge.dataset.liveSyncBadge = "true";
    badge.textContent = message;
    badge.style.position = "fixed";
    badge.style.left = "18px";
    badge.style.bottom = "18px";
    badge.style.zIndex = "10000";
    badge.style.padding = "9px 12px";
    badge.style.borderRadius = "999px";
    badge.style.font = "600 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    badge.style.letterSpacing = "0.01em";
    badge.style.boxShadow = "0 12px 30px rgba(6, 40, 74, 0.18)";
    badge.style.color = mode === "live" ? "#075f60" : "#7a4a00";
    badge.style.background = mode === "live" ? "#dff8f4" : "#fff4d6";
    badge.style.border = mode === "live" ? "1px solid #a7ebe1" : "1px solid #f8daa2";

    if (!existing) {
      document.body.appendChild(badge);
    }
  }

  function writeRemotePayload(payload) {
    if (!payload) return;

    applyingRemote = true;
    try {
      originalSetItem(STORAGE_KEY, JSON.stringify(payload.records || []));
      originalSetItem(REPORTS_KEY, JSON.stringify(payload.reportHistory || []));
      originalSetItem(RELOAD_FLAG, String(Date.now()));
    } finally {
      applyingRemote = false;
    }
  }

  function showRefreshNotice(message) {
    const existing = document.querySelector("[data-live-refresh-notice]");
    const notice = existing || document.createElement("section");
    notice.dataset.liveRefreshNotice = "true";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.style.position = "fixed";
    notice.style.left = "18px";
    notice.style.bottom = "64px";
    notice.style.zIndex = "10002";
    notice.style.maxWidth = "360px";
    notice.style.padding = "14px";
    notice.style.borderRadius = "18px";
    notice.style.background = "#ffffff";
    notice.style.border = "1px solid rgba(7, 95, 96, 0.18)";
    notice.style.boxShadow = "0 18px 50px rgba(6, 40, 74, 0.22)";
    notice.style.font = "500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    notice.style.color = "#17324d";

    if (!existing) {
      const title = document.createElement("div");
      title.textContent = "Live update available";
      title.style.fontWeight = "800";
      title.style.fontSize = "14px";
      title.style.marginBottom = "4px";

      const text = document.createElement("div");
      text.dataset.liveRefreshMessage = "true";
      text.style.marginBottom = "10px";
      text.style.color = "#516070";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.flexWrap = "wrap";

      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.dataset.liveRefreshButton = "true";
      refreshButton.textContent = "Refresh when ready";
      refreshButton.style.border = "0";
      refreshButton.style.borderRadius = "999px";
      refreshButton.style.background = "#0f766e";
      refreshButton.style.color = "white";
      refreshButton.style.cursor = "pointer";
      refreshButton.style.fontWeight = "750";
      refreshButton.style.padding = "9px 13px";
      refreshButton.addEventListener("click", () => {
        writeRemotePayload(pendingRemotePayload);
        window.location.reload();
      });

      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.textContent = "Later";
      dismissButton.style.border = "1px solid rgba(7, 95, 96, 0.16)";
      dismissButton.style.borderRadius = "999px";
      dismissButton.style.background = "#f6fbfb";
      dismissButton.style.color = "#075f60";
      dismissButton.style.cursor = "pointer";
      dismissButton.style.fontWeight = "750";
      dismissButton.style.padding = "9px 13px";
      dismissButton.addEventListener("click", () => notice.remove());

      actions.append(refreshButton, dismissButton);
      notice.append(title, text, actions);
      document.body.appendChild(notice);
    }

    notice.querySelector("[data-live-refresh-message]").textContent = message;
  }

  function removeSignInPanel() {
    document.querySelector("[data-live-signin-panel]")?.remove();
  }

  function showSignInPanel(message) {
    const existing = document.querySelector("[data-live-signin-panel]");
    const panel = existing || document.createElement("section");
    panel.dataset.liveSigninPanel = "true";
    panel.setAttribute("role", "status");
    panel.style.position = "fixed";
    panel.style.left = "18px";
    panel.style.bottom = "64px";
    panel.style.zIndex = "10001";
    panel.style.maxWidth = "340px";
    panel.style.padding = "14px";
    panel.style.borderRadius = "18px";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid rgba(7, 95, 96, 0.18)";
    panel.style.boxShadow = "0 18px 50px rgba(6, 40, 74, 0.22)";
    panel.style.font = "500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    panel.style.color = "#17324d";

    panel.innerHTML = `
      <div style="font-weight: 750; font-size: 14px; margin-bottom: 4px;">Connect live saving</div>
      <div data-live-signin-message style="margin-bottom: 10px; color: #516070;">${message}</div>
      <button type="button" data-live-signin-button style="border: 0; border-radius: 999px; background: #0f766e; color: white; cursor: pointer; font-weight: 750; padding: 9px 13px;">Sign in with Google</button>
    `;

    const button = panel.querySelector("[data-live-signin-button]");
    const messageNode = panel.querySelector("[data-live-signin-message]");
    button.addEventListener("click", async () => {
      const service = getService();
      if (!service || !service.signIn) return;

      button.disabled = true;
      button.textContent = "Opening Google sign-in...";
      showLiveBadge("Google sign-in required", "local");

      try {
        await service.signIn();
        button.textContent = "Connecting live data...";
        await connectLiveData();
      } catch (error) {
        console.error("AuditFlow sign-in failed", error);
        const status = service.status?.();
        messageNode.textContent = status?.message || "Google sign-in could not complete. Please try again.";
        button.disabled = false;
        button.textContent = "Try Google sign-in again";
        showLiveBadge("Google sign-in needed", "local");
      }
    });

    if (!existing) {
      document.body.appendChild(panel);
    }
  }

  function scheduleRemoteSave(action) {
    if (!liveReady || applyingRemote || !getService()) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      getService()
        .saveAll(currentRecords(), currentReportHistory(), {
          action,
          role: currentRole(),
          summary: "Saved from the shared web dashboard"
        })
        .catch((error) => {
          console.error("AuditFlow live save failed", error);
          showLiveBadge("Live save needs attention", "local");
        });
    }, 350);
  }

  window.localStorage.setItem = function patchedSetItem(key, value) {
    originalSetItem(key, value);
    if (key === STORAGE_KEY || key === REPORTS_KEY) {
      if (!applyingRemote) {
        lastLocalWriteAt = Date.now();
      }
      scheduleRemoteSave(key === STORAGE_KEY ? "Register updated" : "Report history updated");
    }
  };

  window.localStorage.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem(key);
    if (key === STORAGE_KEY || key === REPORTS_KEY) {
      if (!applyingRemote) {
        lastLocalWriteAt = Date.now();
      }
      scheduleRemoteSave("Sample data restored");
    }
  };

  function isUserActivelyEditing() {
    const active = document.activeElement;
    const focusedField = active?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
    return Boolean(focusedField) || Date.now() - lastLocalWriteAt < EDITING_GRACE_MS;
  }

  function applyRemoteState(payload) {
    if (!payload || !liveReady) return;

    const nextRecords = JSON.stringify(payload.records || []);
    const nextReports = JSON.stringify(payload.reportHistory || []);
    const currentRecordText = window.localStorage.getItem(STORAGE_KEY) || "";
    const currentReportText = window.localStorage.getItem(REPORTS_KEY) || "";

    if (nextRecords === currentRecordText && nextReports === currentReportText) {
      pendingRemotePayload = null;
      document.querySelector("[data-live-refresh-notice]")?.remove();
      return;
    }

    pendingRemotePayload = payload;

    if (isUserActivelyEditing()) {
      showLiveBadge("Live update waiting", "local");
      showRefreshNotice("Another officer saved an update. Finish your current entry first, then refresh when ready to view the latest shared data.");
      return;
    }

    showLiveBadge("Live update available", "live");
    showRefreshNotice("A live update was received. Refresh when ready to view the latest shared data.");
  }

  async function connectLiveData() {
    if (connecting) return;
    const service = getService();
    if (!service) return;

    connecting = true;

    try {
      const status = await service.init({
        seedRecords: currentRecords(),
        seedReportHistory: currentReportHistory()
      });

      if (!status.ready) {
        liveReady = false;
        const message = status.message || "Live saving is not connected.";
        showLiveBadge(status.mode === "signin" ? "Sign in for live saving" : "Local demo mode", "local");

        if (status.mode === "signin") {
          showSignInPanel(message);
        }
        return;
      }

      liveReady = true;
      removeSignInPanel();
      showLiveBadge("Live data connected", "live");
      service.subscribe(applyRemoteState, (error) => {
        console.error("AuditFlow live listener failed", error);
        showLiveBadge("Live connection interrupted", "local");
      });
    } catch (error) {
      console.error("AuditFlow live connection failed", error);
      const message = getService()?.status?.().message || "Live saving could not connect.";
      showSignInPanel(message);
      showLiveBadge("Local demo mode", "local");
    } finally {
      connecting = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectLiveData, { once: true });
  } else {
    connectLiveData();
  }
})();