(() => {
  "use strict";

  const STORAGE_KEY = "auditflow.records.v1";
  const REPORTS_KEY = "auditflow.reports.v1";
  const ROLES = ["Internal Auditor", "Senior Accounts Officer", "Permanent Secretary"];
  const STATUS_OPTIONS = [
    "",
    "Draft",
    "Submitted",
    "Pending Review",
    "Pending with PS",
    "Pending with Minister",
    "Pending with Officer/Division",
    "Returned for Amendment",
    "Approved",
    "Signed",
    "Deferred",
    "Closed"
  ];
  const PRIORITY_OPTIONS = ["", "High", "Medium", "Low"];
  const PURPOSE_OPTIONS = ["", "Approval", "Information", "Review", "Decision", "Other"];
  const IMPLEMENTATION_OPTIONS = ["", "Not Required", "Not Started", "In Progress", "Completed", "Delayed", "On Hold"];
  const NAV_ITEMS = [
    ["overview", "Overview", "home"],
    ["matrix", "Matrix Register", "table"],
    ["followups", "Follow-ups", "bell"],
    ["implementation", "Implementation", "check"],
    ["reports", "Reports", "report"],
    ["administration", "Administration", "settings"]
  ];

  const app = document.getElementById("app");
  const overlayRoot = document.getElementById("overlay-root");
  const toastRoot = document.getElementById("toast-root");

  const state = {
    page: "overview",
    role: "Internal Auditor",
    globalSearch: "",
    matrixSearch: "",
    statusFilter: "All",
    officerFilter: "All",
    ageFilter: "All",
    reportMonth: monthKey(new Date()),
    commentary:
      "Focused attention is required on matters open beyond 30 days, completion of follow-ups, and improvements to missing control data.",
    reportOptions: {
      executiveSummary: true,
      detailedMatrix: true,
      followupSchedule: true,
      implementationStatus: true
    },
    records: loadRecords(),
    reportHistory: loadJson(REPORTS_KEY, [])
  };

  function loadRecords() {
    const saved = loadJson(STORAGE_KEY, null);
    return Array.isArray(saved)
      ? saved
      : window.AUDITFLOW_SAMPLE_DATA.map((record) => ({ ...record }));
  }

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function persistRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    } catch {
      showToast("Changes are active for this session", "Browser storage is unavailable.");
    }
  }

  function persistReports() {
    try {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(state.reportHistory));
    } catch {
      // The generated report still works without persistent history.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, options = {}) {
    if (!value) return "—";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: options.short ? "short" : "long",
      year: "numeric"
    }).format(date);
  }

  function formatDateTime(date = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
      new Date(year, month - 1, 1)
    );
  }

  function todayStart() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function daysBetween(start, end) {
    if (!start || !end) return 0;
    return Math.max(0, Math.floor((end - start) / 86400000));
  }

  function isClosed(record) {
    return record.status === "Closed" || Boolean(record.dateClosed);
  }

  function daysOpen(record) {
    const start = parseLocalDate(record.dateSubmitted || record.dispatchDate);
    const end = parseLocalDate(record.dateClosed) || todayStart();
    return daysBetween(start, end);
  }

  function ageCategory(record) {
    const days = daysOpen(record);
    if (days <= 7) return "0–7 days";
    if (days <= 14) return "8–14 days";
    if (days <= 30) return "15–30 days";
    return "Over 30 days";
  }

  function isFollowupDue(record) {
    const due = parseLocalDate(record.followUpDate);
    return (
      record.followUpRequired === "Yes" &&
      due &&
      due <= todayStart() &&
      !isClosed(record)
    );
  }

  function isExpectedReturnOverdue(record) {
    const due = parseLocalDate(record.expectedReturnDate);
    return Boolean(due && due < todayStart() && !isClosed(record));
  }

  function metrics(records = state.records) {
    const open = records.filter((record) => !isClosed(record));
    return {
      total: records.length,
      open: open.length,
      closed: records.length - open.length,
      over30: open.filter((record) => daysOpen(record) > 30).length,
      followupsDue: records.filter(isFollowupDue).length,
      overdueExpected: records.filter(isExpectedReturnOverdue).length
    };
  }

  function quality(records = state.records) {
    const missingStatus = records.filter((record) => !record.status).length;
    const missingExpected = records.filter((record) => !record.expectedReturnDate).length;
    const missingPriority = records.filter((record) => !record.priority).length;
    const missingPurpose = records.filter((record) => !record.purpose).length;
    const missingNextAction = records.filter((record) => !record.nextAction && !isClosed(record)).length;
    const totalChecks = records.length * 5 || 1;
    const completedChecks =
      totalChecks -
      missingStatus -
      missingExpected -
      missingPriority -
      missingPurpose -
      missingNextAction;
    return {
      missingStatus,
      missingExpected,
      missingPriority,
      missingPurpose,
      missingNextAction,
      score: Math.max(0, Math.round((completedChecks / totalChecks) * 100))
    };
  }

  function distribution(records, getter, orderedKeys) {
    const counts = Object.fromEntries(orderedKeys.map((key) => [key, 0]));
    records.forEach((record) => {
      const key = getter(record);
      if (key in counts) counts[key] += 1;
    });
    return counts;
  }

  function statusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("submitted")) return "submitted";
    if (normalized.includes("pending")) return "pending";
    if (normalized.includes("approved")) return "approved";
    if (normalized.includes("completed")) return "completed";
    if (normalized.includes("closed")) return "closed";
    if (normalized.includes("delayed") || normalized.includes("overdue")) return "delayed";
    return "";
  }

  function ageClass(days) {
    if (days > 30) return "red";
    if (days > 14) return "amber";
    return "teal";
  }

  function initials(name) {
    const cleaned = String(name || "AU")
      .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (cleaned[0]?.[0] || "A") + (cleaned[1]?.[0] || "U");
  }

  function recordNextAction(record) {
    if (record.nextAction) return record.nextAction;
    if (!record.status) return "Classify and assign next step";
    if (record.status === "Pending with Minister") return "Follow up with Minister’s office";
    if (record.status === "Approved") return "Record implementation or closure";
    if (record.status === "Submitted") return "Confirm receipt and return date";
    if (isExpectedReturnOverdue(record)) return "Escalate overdue return";
    return "Update movement and next action";
  }

  function filteredRecords() {
    const search = state.matrixSearch.trim().toLowerCase();
    return state.records.filter((record) => {
      const haystack = [
        record.reference,
        record.subject,
        record.officer,
        record.status,
        record.currentLocation,
        record.submittedTo
      ]
        .join(" ")
        .toLowerCase();
      const searchMatch = !search || haystack.includes(search);
      const statusMatch =
        state.statusFilter === "All" ||
        (state.statusFilter === "Unclassified" ? !record.status : record.status === state.statusFilter);
      const officerMatch = state.officerFilter === "All" || record.officer === state.officerFilter;
      const ageMatch =
        state.ageFilter === "All" ||
        (state.ageFilter === "Over 30 days"
          ? daysOpen(record) > 30
          : ageCategory(record) === state.ageFilter);
      return searchMatch && statusMatch && officerMatch && ageMatch;
    });
  }

  function canEdit() {
    return state.role !== "Permanent Secretary";
  }

  function icon(name) {
    const paths = {
      home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9 20v-6h6v6"/>',
      table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
      report: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 13h8M8 17h6M8 9h3"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 9 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.7 1.7 1.7 0 0 0 10 3.1V3h4v.1A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      filter: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
      file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
      folder: '<path d="M3 7h7l2 2h9v11H3z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
      download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/>',
      upload: '<path d="M12 17V5m0 0-4 4m4-4 4 4"/><path d="M5 21h14"/>',
      save: '<path d="M5 3h13l2 2v16H4V4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>',
      reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
  }

  function render() {
    const pageNames = {
      overview: ["Department overview", "Live workload, movement, risks and reporting readiness"],
      matrix: ["Matrix register", "One connected record for movement, follow-up, implementation and closure"],
      followups: ["Follow-up monitoring", "Due and overdue actions drawn directly from the register"],
      implementation: ["Implementation tracking", "Monitor actions arising from approved audit recommendations"],
      reports: ["Monthly department report", "Generate the submission directly from current dashboard data"],
      administration: ["Administration", "Roles, data quality controls and prototype data"]
    };
    const [title, subtitle] = pageNames[state.page];

    app.innerHTML = `
      <div class="app-shell">
        ${renderSidebar()}
        <main class="main-shell">
          <header class="topbar">
            <button class="icon-btn mobile-menu" data-action="toggle-menu" aria-label="Open navigation">
              ${icon("menu")}
            </button>
            <div class="page-heading">
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(subtitle)}</p>
            </div>
            <label class="search-box">
              ${icon("search")}
              <span class="sr-only">Search all matters</span>
              <input id="global-search" data-input="global-search" value="${escapeHtml(state.globalSearch)}"
                placeholder="Search matters, officers, references…" />
            </label>
            <div class="topbar-actions">
              <span class="date-label">${icon("calendar")} ${formatDate(toIsoDate(todayStart()))}</span>
              <select class="select-control" data-change="role" aria-label="Current role">
                ${ROLES.map((role) => `<option ${role === state.role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}
              </select>
            </div>
          </header>
          <div class="content ${state.page === "reports" ? "report-page-shell" : ""}">
            ${renderPage()}
          </div>
        </main>
      </div>
    `;
  }

  function renderSidebar() {
    const access = state.role === "Permanent Secretary" ? "View access" : "Edit access";
    return `
      <aside class="sidebar" aria-label="Main navigation">
        <div class="brand">
          <div class="brand-mark">AF</div>
          <div class="brand-copy">
            <strong>AuditFlow</strong>
            <span>Audit &amp; Compliance Unit</span>
          </div>
        </div>
        <nav class="nav-list">
          ${NAV_ITEMS.map(
            ([id, label, iconName]) => `
              <button class="nav-item ${state.page === id ? "active" : ""}" data-nav="${id}">
                ${icon(iconName)}
                <span>${label}</span>
              </button>
            `
          ).join("")}
        </nav>
        <div class="sidebar-footer">
          <div class="role-card">
            <span class="avatar">${escapeHtml(initials(state.role))}</span>
            <span class="role-card-copy">
              <strong>${escapeHtml(state.role)}</strong>
              <small>${access}</small>
            </span>
          </div>
        </div>
      </aside>
    `;
  }

  function renderPage() {
    switch (state.page) {
      case "matrix":
        return renderMatrix();
      case "followups":
        return renderFollowups();
      case "implementation":
        return renderImplementation();
      case "reports":
        return renderReports();
      case "administration":
        return renderAdministration();
      default:
        return renderOverview();
    }
  }

  function renderOverview() {
    const currentMetrics = metrics();
    const currentQuality = quality();
    const ageKeys = ["0–7 days", "8–14 days", "15–30 days", "Over 30 days"];
    const ageCounts = distribution(state.records.filter((record) => !isClosed(record)), ageCategory, ageKeys);
    const workflowKeys = ["Submitted", "Pending with Minister", "Approved", "Unclassified"];
    const workflowCounts = distribution(
      state.records,
      (record) => (workflowKeys.includes(record.status) ? record.status : "Unclassified"),
      workflowKeys
    );
    const priorityIds = [4, 5, 6, 8];
    let priorityRecords = priorityIds
      .map((id) => state.records.find((record) => record.id === id))
      .filter(Boolean);
    const globalQuery = state.globalSearch.trim().toLowerCase();
    if (globalQuery) {
      priorityRecords = state.records
        .filter((record) =>
          [record.reference, record.subject, record.officer, record.status]
            .join(" ")
            .toLowerCase()
            .includes(globalQuery)
        )
        .slice(0, 6);
    }

    return `
      <section class="dashboard-grid" aria-label="Department metrics">
        ${metricCard("file", currentMetrics.total, "Total matters")}
        ${metricCard("folder", currentMetrics.open, "Open")}
        ${metricCard("clock", currentMetrics.over30, "Over 30 days", "danger")}
        ${metricCard("bell", currentMetrics.followupsDue, "Follow-ups due", "warning")}
      </section>

      <section class="visual-grid">
        ${renderStackedPanel("Matters by age (days)", ageKeys, ageCounts, "age")}
        ${renderStackedPanel("Matters by workflow stage", workflowKeys, workflowCounts, "status")}
        <aside class="panel month-rail">
          <h2>This month</h2>
          <select class="field" data-change="report-month">${monthOptions()}</select>
          <div class="readiness-block">
            <h3 class="rail-title">Report readiness</h3>
            <div class="progress"><span style="width:${currentQuality.score}%"></span></div>
            <div class="progress-meta">
              <strong>${currentQuality.score}% complete</strong>
              <span>based on register fields</span>
            </div>
          </div>
          <div class="issue-list">
            ${issueRow(`${currentQuality.missingStatus} matters need a status`, currentQuality.missingStatus)}
            ${issueRow(`${currentQuality.missingExpected} need an expected return date`, currentQuality.missingExpected)}
            ${issueRow(`${currentQuality.missingPriority} need a priority`, currentQuality.missingPriority)}
          </div>
          <button class="btn primary" style="width:100%; margin-top:18px" data-action="go-reports">
            ${icon("report")} Generate ${escapeHtml(monthLabel(state.reportMonth).split(" ")[0])} report
          </button>
          <button class="btn ghost small" style="width:100%; margin-top:8px" data-action="show-report-history">
            View report history ${icon("chevron")}
          </button>
        </aside>

        <section class="panel wide-panel">
          <div class="panel-header">
            <h2>Priority attention</h2>
            <div class="toolbar-group">
              <button class="btn small" data-action="go-matrix">${icon("filter")} Filter</button>
              ${canEdit() ? `<button class="btn primary small" data-action="add-matter">${icon("plus")} Add matter</button>` : ""}
            </div>
          </div>
          ${renderPriorityTable(priorityRecords)}
        </section>
      </section>

      <section class="panel recent-panel">
        <div class="panel-header">
          <h3>Recent activity</h3>
        </div>
        <div class="activity-grid">
          ${renderActivity()}
        </div>
      </section>
    `;
  }

  function metricCard(iconName, value, label, variant = "") {
    return `
      <article class="metric-card">
        <span class="metric-icon ${variant}">${icon(iconName)}</span>
        <span>
          <strong class="metric-value">${value}</strong>
          <span class="metric-label">${escapeHtml(label)}</span>
        </span>
      </article>
    `;
  }

  function renderStackedPanel(title, keys, counts, type) {
    const total = keys.reduce((sum, key) => sum + counts[key], 0) || 1;
    const colors =
      type === "age"
        ? ["#2c9d69", "#0b9698", "#e7a31d", "#db3e3e"]
        : ["#0d6597", "#e5a222", "#58a45f", "#909ba5"];
    return `
      <article class="panel chart-panel">
        <h3>${escapeHtml(title)}</h3>
        <div class="stacked-bar" role="img" aria-label="${escapeHtml(title)}">
          ${keys
            .map(
              (key, index) =>
                `<span class="stacked-segment ${type}-${index}" style="width:${(counts[key] / total) * 100}%"></span>`
            )
            .join("")}
        </div>
        <div class="legend-grid">
          ${keys
            .map(
              (key, index) => `
                <div>
                  <div class="legend-label">
                    <span class="legend-dot" style="background:${colors[index]}"></span>
                    <span>${escapeHtml(key)}</span>
                  </div>
                  <div class="legend-value">${counts[key]}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function issueRow(label, count) {
    return `
      <div class="issue-row">
        <span class="warning-icon">△</span>
        <span>${escapeHtml(label)}</span>
        <strong>${count}</strong>
      </div>
    `;
  }

  function renderPriorityTable(records) {
    if (!records.length) {
      return `<div class="empty-state" style="min-height:240px"><p>No matching matters found.</p></div>`;
    }
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Matter</th>
              <th>Officer</th>
              <th>Current stage</th>
              <th>Age</th>
              <th>Next action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map((record) => {
                const days = daysOpen(record);
                return `
                  <tr data-row-id="${record.id}">
                    <td>${escapeHtml(record.reference || "Not assigned")}</td>
                    <td><div class="matter-title">${escapeHtml(record.subject)}</div></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span class="avatar" style="width:28px;height:28px">${escapeHtml(initials(record.officer))}</span>
                        <span>${escapeHtml(record.officer.replace(/^(Mr\.|Ms\.)\s*/i, ""))}</span>
                      </div>
                    </td>
                    <td><span class="status ${statusClass(record.status)}">${escapeHtml(record.status || "Unclassified")}</span></td>
                    <td><span class="age ${ageClass(days)}">${days} days</span></td>
                    <td>${escapeHtml(recordNextAction(record))}</td>
                    <td>${icon("chevron")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span>Showing ${records.length} matter${records.length === 1 ? "" : "s"}</span>
        <button class="btn small" data-action="go-matrix">Open full register</button>
      </div>
    `;
  }

  function renderActivity() {
    const activity = [
      [state.records[13], "submitted matter", "Today, 10:05"],
      [state.records[12], "updated current location", "4 days ago"],
      [state.records[11], "recorded a follow-up", "8 days ago"],
      [state.records[10], "recorded approval", "14 days ago"]
    ].filter(([record]) => record);
    return activity
      .map(
        ([record, action, time]) => `
          <article class="activity-item">
            <span class="avatar">${escapeHtml(initials(record.officer))}</span>
            <span class="activity-copy">
              <strong>${escapeHtml(record.officer.replace(/^(Mr\.|Ms\.)\s*/i, ""))} ${escapeHtml(action)}</strong>
              <span>${escapeHtml(record.subject)}</span>
              <time>${escapeHtml(time)}</time>
            </span>
          </article>
        `
      )
      .join("");
  }

  function renderMatrix() {
    const records = filteredRecords();
    const officers = [...new Set(state.records.map((record) => record.officer).filter(Boolean))].sort();
    return `
      <div class="toolbar">
        <div class="toolbar-group">
          <label class="search-box">
            ${icon("search")}
            <span class="sr-only">Search register</span>
            <input id="matrix-search" data-input="matrix-search" value="${escapeHtml(state.matrixSearch)}"
              placeholder="Search register…" />
          </label>
          <select class="select-control" data-change="status-filter" aria-label="Filter by status">
            ${selectOptions(["All", "Unclassified", ...STATUS_OPTIONS.filter(Boolean)], state.statusFilter)}
          </select>
          <select class="select-control" data-change="officer-filter" aria-label="Filter by officer">
            ${selectOptions(["All", ...officers], state.officerFilter)}
          </select>
          <select class="select-control" data-change="age-filter" aria-label="Filter by age">
            ${selectOptions(["All", "0–7 days", "8–14 days", "15–30 days", "Over 30 days"], state.ageFilter)}
          </select>
        </div>
        <div class="toolbar-group">
          <button class="btn" data-action="export-csv">${icon("download")} Export CSV</button>
          ${canEdit() ? `<button class="btn primary" data-action="add-matter">${icon("plus")} Add matter</button>` : ""}
        </div>
      </div>
      ${state.role === "Permanent Secretary" ? `<div class="read-only-notice">Permanent Secretary access is view-only for register records. Reports can still be generated and exported.</div>` : ""}
      <section class="panel matrix-panel">
        <div class="panel-header">
          <h2>All matters</h2>
          <span>${records.length} of ${state.records.length}</span>
        </div>
        <div class="table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Reference</th>
                <th>Matter</th>
                <th>Officer</th>
                <th>Submitted to</th>
                <th>Status</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Days open</th>
                <th>Expected return</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              ${
                records.length
                  ? records
                      .map((record) => {
                        const days = daysOpen(record);
                        return `
                          <tr data-row-id="${record.id}">
                            <td>${record.id}</td>
                            <td>${escapeHtml(record.reference || "—")}</td>
                            <td>
                              <div class="matter-title">${escapeHtml(record.subject)}</div>
                              <div class="matter-subtitle">${escapeHtml(record.purpose || "Purpose not set")}</div>
                            </td>
                            <td>${escapeHtml(record.officer)}</td>
                            <td>${escapeHtml(record.submittedTo || "—")}</td>
                            <td><span class="status ${statusClass(record.status)}">${escapeHtml(record.status || "Unclassified")}</span></td>
                            <td>${escapeHtml(record.currentLocation || "—")}</td>
                            <td>${escapeHtml(record.priority || "Not set")}</td>
                            <td><span class="age ${ageClass(days)}">${days}</span></td>
                            <td>${formatDate(record.expectedReturnDate, { short: true })}</td>
                            <td>${isFollowupDue(record) ? `<span class="status overdue">Due</span>` : escapeHtml(record.followUpRequired || "—")}</td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `<tr><td colspan="11" style="text-align:center;padding:40px">No matching matters found.</td></tr>`
              }
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>Derived fields such as days open and ageing update automatically.</span>
          <span>${records.length} result${records.length === 1 ? "" : "s"}</span>
        </div>
      </section>
    `;
  }

  function renderFollowups() {
    const due = state.records.filter(isFollowupDue).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
    const upcoming = state.records
      .filter((record) => record.followUpRequired === "Yes" && !isFollowupDue(record) && !isClosed(record))
      .sort((a, b) => (a.followUpDate || "").localeCompare(b.followUpDate || ""));
    return `
      <p class="page-note">Follow-ups are generated from “Follow Up Required” and “Follow Up Date” in the register. Update a matter once action is taken.</p>
      <section class="dashboard-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:20px">
        ${metricCard("bell", due.length, "Due or overdue", due.length ? "warning" : "")}
        ${metricCard("calendar", upcoming.length, "Upcoming")}
        ${metricCard("check", state.records.filter((record) => record.followUpRequired === "No").length, "No follow-up required")}
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Follow-up schedule</h2>
          ${canEdit() ? `<button class="btn primary small" data-action="add-matter">${icon("plus")} Add matter</button>` : ""}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Due date</th><th>Matter</th><th>Officer</th><th>Status</th><th>Latest follow-up</th><th>Action</th></tr></thead>
            <tbody>
              ${
                [...due, ...upcoming].length
                  ? [...due, ...upcoming]
                      .map(
                        (record) => `
                          <tr data-row-id="${record.id}">
                            <td><span class="age ${isFollowupDue(record) ? "red" : "teal"}">${formatDate(record.followUpDate, { short: true })}</span></td>
                            <td><div class="matter-title">${escapeHtml(record.subject)}</div></td>
                            <td>${escapeHtml(record.officer)}</td>
                            <td><span class="status ${isFollowupDue(record) ? "overdue" : ""}">${isFollowupDue(record) ? "Due" : "Upcoming"}</span></td>
                            <td>${escapeHtml(record.followUpRemarks || "No remarks recorded")}</td>
                            <td>${icon("chevron")}</td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="6" style="text-align:center;padding:40px">No follow-ups have been scheduled.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderImplementation() {
    const implementationRecords = state.records.filter(
      (record) => record.implementationRequired === "Yes" || record.implementationStatus
    );
    if (!implementationRecords.length) {
      return `
        <section class="panel empty-state">
          <div>
            <div class="empty-state-mark">${icon("check")}</div>
            <h2>No implementation actions recorded yet</h2>
            <p>When an approved matter requires action, set “Implementation Required” to Yes and record the responsible action, status and next milestone. The implementation dashboard will update automatically.</p>
            ${canEdit() ? `<button class="btn primary" data-action="go-matrix">${icon("table")} Review approved matters</button>` : ""}
          </div>
        </section>
      `;
    }
    const implementationMetrics = {
      open: implementationRecords.filter((record) => record.implementationStatus !== "Completed").length,
      completed: implementationRecords.filter((record) => record.implementationStatus === "Completed").length,
      delayed: implementationRecords.filter((record) => ["Delayed", "On Hold"].includes(record.implementationStatus)).length
    };
    return `
      <section class="dashboard-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:20px">
        ${metricCard("folder", implementationMetrics.open, "Open actions")}
        ${metricCard("check", implementationMetrics.completed, "Completed")}
        ${metricCard("clock", implementationMetrics.delayed, "Delayed or on hold", "danger")}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Implementation actions</h2></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Matter</th><th>Action</th><th>Status</th><th>Officer</th><th>Next step</th></tr></thead>
            <tbody>
              ${implementationRecords
                .map(
                  (record) => `
                    <tr data-row-id="${record.id}">
                      <td><div class="matter-title">${escapeHtml(record.subject)}</div></td>
                      <td>${escapeHtml(record.implementation || "Action not described")}</td>
                      <td><span class="status ${statusClass(record.implementationStatus)}">${escapeHtml(record.implementationStatus || "Not started")}</span></td>
                      <td>${escapeHtml(record.officer)}</td>
                      <td>${escapeHtml(record.nextAction || "Update action plan")}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderReports() {
    const currentQuality = quality();
    const currentMetrics = metrics();
    const movement = reportMovement(state.reportMonth);
    const attention = reportAttentionRecords();
    const month = monthLabel(state.reportMonth);
    const commentary = escapeHtml(state.commentary);
    return `
      <div class="toolbar">
        <div class="toolbar-group">
          <select class="select-control" data-change="report-month">${monthOptions()}</select>
          <span class="status pending">Draft</span>
          <span class="status">${escapeHtml(state.role)} — ${state.role === "Permanent Secretary" ? "View access" : "Edit access"}</span>
        </div>
        <div class="toolbar-group">
          <button class="btn" data-action="print-report">${icon("report")} Preview PDF</button>
          <button class="btn navy" data-action="generate-report">${icon("report")} Generate report</button>
        </div>
      </div>

      <div class="readiness-strip">
        <div class="readiness-summary">
          <strong>${currentQuality.score}% ready</strong>
          <div class="progress"><span style="width:${currentQuality.score}%"></span></div>
        </div>
        <div class="readiness-issue"><span class="warning-icon">△</span>${currentQuality.missingStatus} matters need a status</div>
        <div class="readiness-issue"><span class="warning-icon">△</span>${currentQuality.missingExpected} expected return dates missing</div>
        <div class="readiness-issue"><span class="warning-icon">△</span>${currentQuality.missingPriority} priorities missing</div>
      </div>

      <div class="report-workspace">
        <article class="report-preview" id="report-preview">
          <header class="report-document-header">
            <h2>Audit &amp; Compliance Unit — Monthly Department Report</h2>
            <p>Reporting period: ${escapeHtml(month)}</p>
          </header>

          ${
            state.reportOptions.executiveSummary
              ? `
                <section class="report-section">
                  <h3>1. Executive summary</h3>
                  <div class="report-kpis">
                    ${reportKpi(currentMetrics.total, "Total matters")}
                    ${reportKpi(currentMetrics.open, "Open matters")}
                    ${reportKpi(currentMetrics.over30, "Over 30 days")}
                    ${reportKpi(currentMetrics.followupsDue, "Follow-ups due")}
                  </div>
                </section>
              `
              : ""
          }

          <section class="report-section">
            <h3>2. Movement during the month</h3>
            <table class="report-table">
              <thead><tr><th>Description</th><th>Opening balance</th><th>New matters</th><th>Closed</th><th>Closing balance</th></tr></thead>
              <tbody>
                <tr><td>Total matters</td><td>${movement.opening}</td><td>${movement.newMatters}</td><td>${movement.closed}</td><td>${movement.closing}</td></tr>
                <tr><td>Open matters</td><td>${movement.opening}</td><td>${movement.newMatters}</td><td>${movement.closed}</td><td>${currentMetrics.open}</td></tr>
                <tr><td>Over 30 days</td><td>—</td><td>—</td><td>—</td><td>${currentMetrics.over30}</td></tr>
                <tr><td>Follow-ups due</td><td>—</td><td>—</td><td>—</td><td>${currentMetrics.followupsDue}</td></tr>
              </tbody>
            </table>
          </section>

          <section class="report-section">
            <h3>3. Matters requiring executive attention</h3>
            <table class="report-table">
              <thead><tr><th style="width:38%">Matter</th><th>Area</th><th>Risk</th><th>Days open</th><th>Priority</th><th>Current status</th></tr></thead>
              <tbody>
                ${attention
                  .map(
                    (record) => `
                      <tr>
                        <td>${escapeHtml(record.subject)}</td>
                        <td>${escapeHtml(record.purpose || "Compliance")}</td>
                        <td>${daysOpen(record) > 30 ? "Attention" : "Monitor"}</td>
                        <td>${daysOpen(record)}</td>
                        <td>${escapeHtml(record.priority || "Unrated")}</td>
                        <td>${escapeHtml(record.status || "Unclassified")}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </section>

          ${
            state.reportOptions.followupSchedule || state.reportOptions.implementationStatus
              ? `
                <section class="report-section">
                  <h3>4. Follow-up and implementation</h3>
                  <table class="report-table">
                    <thead><tr><th>Type</th><th>Due / open</th><th>Completed</th><th>Overdue / delayed</th><th>Completion rate</th></tr></thead>
                    <tbody>
                      ${
                        state.reportOptions.followupSchedule
                          ? `<tr><td>Follow-ups</td><td>${state.records.filter((r) => r.followUpRequired === "Yes").length}</td><td>0</td><td>${currentMetrics.followupsDue}</td><td>0%</td></tr>`
                          : ""
                      }
                      ${
                        state.reportOptions.implementationStatus
                          ? `<tr><td>Implementation actions</td><td>${state.records.filter((r) => r.implementationRequired === "Yes").length}</td><td>${state.records.filter((r) => r.implementationStatus === "Completed").length}</td><td>${state.records.filter((r) => ["Delayed", "On Hold"].includes(r.implementationStatus)).length}</td><td>${implementationCompletionRate()}%</td></tr>`
                          : ""
                      }
                    </tbody>
                  </table>
                </section>
              `
              : ""
          }

          <section class="report-section">
            <h3>5. Recommended management actions</h3>
            <ul class="report-actions-list">
              <li>Provide direction on ${currentMetrics.over30} matters open beyond 30 days.</li>
              <li>Assign expected return dates and priorities to strengthen escalation and reporting.</li>
              <li>Ensure timely provision of requested documentation for grant acquittal reviews.</li>
              <li>Track approved matters through implementation and formal closure.</li>
            </ul>
          </section>

          <section class="report-section">
            <h3>Management commentary</h3>
            <p style="font-size:10.5px;margin:0;color:#172a3d">${commentary || "No management commentary entered."}</p>
          </section>
        </article>

        <aside class="report-settings">
          <section class="settings-panel">
            <h2>Report settings</h2>
            <div class="check-list">
              ${reportCheck("executiveSummary", "Include executive summary")}
              ${reportCheck("detailedMatrix", "Include detailed matrix")}
              ${reportCheck("followupSchedule", "Include follow-up schedule")}
              ${reportCheck("implementationStatus", "Include implementation status")}
            </div>
            ${readonlyField("Prepared by", "Internal Auditor")}
            ${readonlyField("Reviewed by", "Senior Accounts Officer")}
            ${readonlyField("Submission to", "Permanent Secretary")}
            <div class="form-field">
              <label for="commentary">Management commentary</label>
              <textarea id="commentary" class="field" data-input="commentary" maxlength="500">${commentary}</textarea>
              <div class="char-count">${state.commentary.length} / 500</div>
            </div>
          </section>

          <section class="settings-panel">
            <h3>Validation issues</h3>
            <div class="validation-list">
              ${validationItem("Matters need a status", currentQuality.missingStatus, "status")}
              ${validationItem("Expected return dates missing", currentQuality.missingExpected, "expected")}
              ${validationItem("Priorities missing", currentQuality.missingPriority, "priority")}
            </div>
          </section>
        </aside>
      </div>

      <footer class="report-actionbar">
        <button class="btn" data-action="save-draft">${icon("save")} Save draft</button>
        <button class="btn" data-action="export-word">${icon("download")} Export Word</button>
        <button class="btn" data-action="print-report">${icon("report")} Export PDF</button>
        <button class="btn navy" data-action="generate-report">${icon("upload")} Generate &amp; record submission</button>
      </footer>
    `;
  }

  function reportKpi(value, label) {
    return `<div class="report-kpi"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function reportCheck(key, label) {
    return `
      <label class="checkbox-row">
        <input type="checkbox" data-report-option="${key}" ${state.reportOptions[key] ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function readonlyField(label, value) {
    return `
      <div class="form-field">
        <label>${escapeHtml(label)}</label>
        <input class="field" value="${escapeHtml(value)}" readonly />
      </div>
    `;
  }

  function validationItem(label, count, filter) {
    return `
      <div class="validation-item">
        <span class="warning-icon">△</span>
        <span>${escapeHtml(label)}</span>
        <span class="validation-count">${count}</span>
        <button class="text-link" data-action="fix-quality" data-filter="${filter}">Fix</button>
      </div>
    `;
  }

  function reportMovement(key) {
    const [year, month] = key.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const newMatters = state.records.filter((record) => {
      const date = parseLocalDate(record.dispatchDate);
      return date >= start && date < end;
    }).length;
    const closed = state.records.filter((record) => {
      const date = parseLocalDate(record.dateClosed);
      return date && date >= start && date < end;
    }).length;
    const opening = state.records.filter((record) => {
      const opened = parseLocalDate(record.dispatchDate);
      const closedDate = parseLocalDate(record.dateClosed);
      return opened < start && (!closedDate || closedDate >= start);
    }).length;
    return { opening, newMatters, closed, closing: opening + newMatters - closed };
  }

  function reportAttentionRecords() {
    const preferred = [4, 5, 14]
      .map((id) => state.records.find((record) => record.id === id))
      .filter(Boolean);
    if (preferred.length === 3) return preferred;
    return [...state.records]
      .filter((record) => !isClosed(record))
      .sort((a, b) => daysOpen(b) - daysOpen(a))
      .slice(0, 3);
  }

  function implementationCompletionRate() {
    const required = state.records.filter((record) => record.implementationRequired === "Yes");
    if (!required.length) return 0;
    return Math.round(
      (required.filter((record) => record.implementationStatus === "Completed").length / required.length) * 100
    );
  }

  function renderAdministration() {
    const currentQuality = quality();
    return `
      <div class="admin-grid">
        <section class="panel admin-card">
          <h2>Access roles</h2>
          <p>The prototype demonstrates the intended separation of duties.</p>
          <div class="role-table">
            <div class="role-row"><strong>Internal Auditor</strong><span>Create and update matters, follow-ups, implementation actions, and draft reports.</span></div>
            <div class="role-row"><strong>Senior Accounts Officer</strong><span>Review and update records, validate report completeness, and generate reports.</span></div>
            <div class="role-row"><strong>Permanent Secretary</strong><span>View dashboards and records; generate or export reports without changing source data.</span></div>
          </div>
        </section>

        <section class="panel admin-card">
          <h2>Data quality</h2>
          <p>These controls feed the dashboard and monthly report readiness score.</p>
          <div class="quality-grid">
            <div class="quality-item"><strong>${currentQuality.missingStatus}</strong><span>Status missing</span></div>
            <div class="quality-item"><strong>${currentQuality.missingExpected}</strong><span>Return date missing</span></div>
            <div class="quality-item"><strong>${currentQuality.missingPriority}</strong><span>Priority missing</span></div>
            <div class="quality-item"><strong>${currentQuality.missingNextAction}</strong><span>Next action missing</span></div>
          </div>
          <button class="btn" style="margin-top:16px" data-action="go-matrix">${icon("table")} Review register</button>
        </section>

        <section class="panel admin-card">
          <h2>Prototype data</h2>
          <p>Changes are saved only in this browser. Reset restores the 14 matters imported from the supplied matrix.</p>
          <div class="toolbar-group">
            <button class="btn" data-action="export-csv">${icon("download")} Export CSV</button>
            <button class="btn danger" data-action="reset-data">${icon("reset")} Reset sample data</button>
          </div>
        </section>

        <section class="panel admin-card">
          <h2>Production connection plan</h2>
          <p>A live deployment should connect the same formulas and views to a shared, auditable data service.</p>
          <div class="role-table">
            <div class="role-row"><strong>Authentication</strong><span>Government Microsoft 365 / Entra ID single sign-on.</span></div>
            <div class="role-row"><strong>Data</strong><span>SharePoint Lists or SQL database with change history.</span></div>
            <div class="role-row"><strong>Documents</strong><span>Controlled file links and versions in SharePoint.</span></div>
            <div class="role-row"><strong>Automation</strong><span>Email reminders, overdue alerts, monthly report scheduling and submission logs.</span></div>
          </div>
        </section>
      </div>
    `;
  }

  function selectOptions(options, selected) {
    return options
      .map((option) => `<option ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`)
      .join("");
  }

  function monthOptions() {
    const now = new Date();
    const options = [];
    for (let offset = -5; offset <= 2; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const key = monthKey(date);
      options.push(`<option value="${key}" ${key === state.reportMonth ? "selected" : ""}>${escapeHtml(monthLabel(key))}</option>`);
    }
    return options.join("");
  }

  function toIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function showRecord(id) {
    const record = state.records.find((item) => item.id === Number(id));
    if (!record) return;
    const editable = canEdit();
    overlayRoot.innerHTML = `
      <div class="overlay" data-action="close-overlay">
        <section class="drawer" role="dialog" aria-modal="true" aria-label="Matter details" data-overlay-panel>
          <header class="drawer-header">
            <div>
              <h2>${escapeHtml(record.reference || `Matter ${record.id}`)}</h2>
              <p>${escapeHtml(record.subject)}</p>
            </div>
            <button class="icon-btn" data-action="close-overlay" aria-label="Close">${icon("close")}</button>
          </header>
          <form id="record-form" data-record-id="${record.id}" class="drawer-body">
            ${!editable ? `<div class="read-only-notice">This role has view-only access to register records.</div>` : ""}
            <div class="form-grid">
              ${field("reference", "Reference number", record.reference, editable)}
              ${field("dispatchDate", "Dispatch date", record.dispatchDate, editable, "date")}
              ${field("subject", "Subject", record.subject, editable, "textarea", "span-2")}
              ${field("officer", "Originating officer", record.officer, editable)}
              ${field("purpose", "Purpose", record.purpose, editable, "select", "", PURPOSE_OPTIONS)}
              ${field("submittedTo", "Submitted to", record.submittedTo, editable)}
              ${field("dateSubmitted", "Date submitted", record.dateSubmitted, editable, "date")}
              ${field("currentLocation", "Current location", record.currentLocation, editable)}
              ${field("status", "Current status", record.status, editable, "select", "", STATUS_OPTIONS)}
              ${field("priority", "Priority", record.priority, editable, "select", "", PRIORITY_OPTIONS)}
              ${field("expectedReturnDate", "Expected return date", record.expectedReturnDate, editable, "date")}
              ${field("latestUpdate", "Latest update", record.latestUpdate, editable, "textarea", "span-2")}
              ${field("decision", "Decision / final outcome", record.decision, editable, "textarea", "span-2")}
              ${field("nextAction", "Next course of action", record.nextAction, editable, "textarea", "span-2")}
              ${field("implementationRequired", "Implementation required", record.implementationRequired, editable, "select", "", ["", "Yes", "No"])}
              ${field("implementationStatus", "Implementation status", record.implementationStatus, editable, "select", "", IMPLEMENTATION_OPTIONS)}
              ${field("implementation", "Implementation action", record.implementation, editable, "textarea", "span-2")}
              ${field("followUpRequired", "Follow-up required", record.followUpRequired, editable, "select", "", ["", "Yes", "No"])}
              ${field("followUpDate", "Follow-up date", record.followUpDate, editable, "date")}
              ${field("followUpRemarks", "Follow-up remarks", record.followUpRemarks, editable, "textarea", "span-2")}
              ${field("closureOutcome", "Closure / final outcome", record.closureOutcome, editable, "textarea", "span-2")}
              ${field("dateClosed", "Date closed", record.dateClosed, editable, "date")}
            </div>
          </form>
          <footer class="drawer-footer">
            <span>Days open: <strong>${daysOpen(record)}</strong> · ${ageCategory(record)}</span>
            <div style="display:flex;gap:9px">
              ${editable ? `<button class="btn danger" data-action="delete-record" data-id="${record.id}">Delete</button>` : ""}
              <button class="btn" data-action="close-overlay">Close</button>
              ${editable ? `<button class="btn primary" data-action="save-record">${icon("save")} Save changes</button>` : ""}
            </div>
          </footer>
        </section>
      </div>
    `;
  }

  function field(name, label, value, editable, type = "text", className = "", options = []) {
    const disabled = editable ? "" : "disabled";
    const safeValue = escapeHtml(value);
    let control = "";
    if (type === "textarea") {
      control = `<textarea class="field" name="${name}" ${disabled}>${safeValue}</textarea>`;
    } else if (type === "select") {
      control = `<select class="field" name="${name}" ${disabled}>${options
        .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option || "Not set")}</option>`)
        .join("")}</select>`;
    } else {
      control = `<input class="field" name="${name}" type="${type}" value="${safeValue}" ${disabled} />`;
    }
    return `<div class="form-field ${className}"><label>${escapeHtml(label)}</label>${control}</div>`;
  }

  function showAddMatter() {
    if (!canEdit()) return;
    overlayRoot.innerHTML = `
      <div class="overlay modal-shell" data-action="close-overlay">
        <section class="modal" role="dialog" aria-modal="true" aria-label="Add matter" data-overlay-panel>
          <header class="modal-header">
            <div><h2>Add matter</h2><p>Create one connected record for movement, follow-up and reporting.</p></div>
            <button class="icon-btn" data-action="close-overlay" aria-label="Close">${icon("close")}</button>
          </header>
          <form id="add-form" class="modal-body">
            <div class="form-grid">
              ${field("reference", "Reference number", "", true)}
              ${field("dispatchDate", "Dispatch date", toIsoDate(todayStart()), true, "date")}
              ${field("subject", "Subject", "", true, "textarea", "span-2")}
              ${field("officer", "Originating officer", "Mr. Ashvir Raj", true)}
              ${field("purpose", "Purpose", "", true, "select", "", PURPOSE_OPTIONS)}
              ${field("submittedTo", "Submitted to", "", true)}
              ${field("dateSubmitted", "Date submitted", toIsoDate(todayStart()), true, "date")}
              ${field("currentLocation", "Current location", "", true)}
              ${field("status", "Current status", "Draft", true, "select", "", STATUS_OPTIONS)}
              ${field("priority", "Priority", "Medium", true, "select", "", PRIORITY_OPTIONS)}
              ${field("expectedReturnDate", "Expected return date", "", true, "date")}
              ${field("nextAction", "Next course of action", "", true, "textarea", "span-2")}
            </div>
          </form>
          <footer class="modal-footer">
            <button class="btn" data-action="close-overlay">Cancel</button>
            <button class="btn primary" data-action="create-record">${icon("plus")} Add matter</button>
          </footer>
        </section>
      </div>
    `;
  }

  function collectForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function saveRecord() {
    const form = document.getElementById("record-form");
    if (!form || !canEdit()) return;
    const id = Number(form.dataset.recordId);
    const index = state.records.findIndex((record) => record.id === id);
    if (index < 0) return;
    state.records[index] = { ...state.records[index], ...collectForm(form) };
    persistRecords();
    closeOverlay();
    render();
    showToast("Matter updated", "Dashboard and report figures have been recalculated.");
  }

  function createRecord() {
    const form = document.getElementById("add-form");
    if (!form || !canEdit()) return;
    const values = collectForm(form);
    if (!values.subject.trim()) {
      showToast("Subject required", "Enter a short description of the matter.");
      form.querySelector('[name="subject"]').focus();
      return;
    }
    const nextId = state.records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0) + 1;
    state.records.push({
      id: nextId,
      recommendations: "",
      latestUpdate: "",
      decision: "",
      implementationRequired: "",
      implementation: "",
      implementationStatus: "",
      followUpRequired: "",
      followUpDate: "",
      followUpRemarks: "",
      closureOutcome: "",
      dateClosed: "",
      ...values
    });
    persistRecords();
    closeOverlay();
    state.page = "matrix";
    render();
    showToast("Matter added", "It is now included in dashboard metrics and monthly reporting.");
  }

  function deleteRecord(id) {
    if (!canEdit()) return;
    const record = state.records.find((item) => item.id === Number(id));
    if (!record) return;
    if (!window.confirm(`Delete “${record.subject}”? This cannot be undone in the prototype.`)) return;
    state.records = state.records.filter((item) => item.id !== Number(id));
    persistRecords();
    closeOverlay();
    render();
    showToast("Matter deleted", "Dashboard and reports have been recalculated.");
  }

  function closeOverlay() {
    overlayRoot.innerHTML = "";
  }

  function showToast(title, message = "") {
    toastRoot.innerHTML = `<div class="toast"><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}</div>`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toastRoot.innerHTML = "";
    }, 3400);
  }

  function exportCsv() {
    const headers = [
      "No.",
      "Dispatch Date",
      "Reference Number",
      "Originating Officer",
      "Subject",
      "Purpose",
      "Submitted To",
      "Priority",
      "Date Submitted",
      "Current Location",
      "Current Status",
      "Expected Return Date",
      "Days Pending",
      "Ageing Category",
      "Latest Update",
      "Decision / Final Outcome",
      "Next Course of Action",
      "Implementation Required",
      "Implementation",
      "Current Status on Implementation",
      "Follow Up Required",
      "Follow Up Date",
      "Follow Up Remarks",
      "Closure / Final Outcome",
      "Date Closed"
    ];
    const rows = state.records.map((record) => [
      record.id,
      record.dispatchDate,
      record.reference,
      record.officer,
      record.subject,
      record.purpose,
      record.submittedTo,
      record.priority,
      record.dateSubmitted,
      record.currentLocation,
      record.status,
      record.expectedReturnDate,
      daysOpen(record),
      ageCategory(record),
      record.latestUpdate,
      record.decision,
      record.nextAction,
      record.implementationRequired,
      record.implementation,
      record.implementationStatus,
      record.followUpRequired,
      record.followUpDate,
      record.followUpRemarks,
      record.closureOutcome,
      record.dateClosed
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    downloadBlob(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
      `AuditFlow-Matrix-${toIsoDate(todayStart())}.csv`
    );
  }

  function exportWord() {
    const report = document.getElementById("report-preview");
    if (!report) return;
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head><meta charset="utf-8"><title>AuditFlow Monthly Report</title>
          <style>
            body{font-family:Arial,sans-serif;color:#172a3d;font-size:10pt}
            h2{color:#06284a;font-size:18pt;border-bottom:1px solid #06284a;padding-bottom:6pt}
            h3{color:#06284a;font-size:12pt}
            table{width:100%;border-collapse:collapse;margin:6pt 0 12pt}
            th,td{border:1px solid #aebbc5;padding:5pt;text-align:left}
            th{background:#edf2f5}.report-kpis{display:table;width:100%}.report-kpi{display:table-cell;border:1px solid #aebbc5;text-align:center;padding:8pt}
            .report-kpi strong{display:block;color:#087f83;font-size:18pt}.report-kpi span{font-size:8pt}
          </style>
        </head><body>${report.innerHTML}</body></html>`;
    downloadBlob(
      new Blob(["\ufeff", html], { type: "application/msword" }),
      `AuditFlow-Monthly-Report-${state.reportMonth}.doc`
    );
    showToast("Word report exported", "The document was generated from the current register.");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function generateReport() {
    const snapshot = {
      id: Date.now(),
      month: state.reportMonth,
      generatedAt: new Date().toISOString(),
      generatedBy: state.role,
      metrics: metrics(),
      quality: quality()
    };
    state.reportHistory.unshift(snapshot);
    state.reportHistory = state.reportHistory.slice(0, 20);
    persistReports();
    showToast("Report generated and recorded", `${monthLabel(state.reportMonth)} · ${state.role}`);
  }

  function showReportHistory() {
    overlayRoot.innerHTML = `
      <div class="overlay modal-shell" data-action="close-overlay">
        <section class="modal" role="dialog" aria-modal="true" data-overlay-panel>
          <header class="modal-header">
            <div><h2>Report history</h2><p>Reports recorded in this browser prototype.</p></div>
            <button class="icon-btn" data-action="close-overlay">${icon("close")}</button>
          </header>
          <div class="modal-body">
            ${
              state.reportHistory.length
                ? `<div class="role-table">${state.reportHistory
                    .map(
                      (item) => `
                        <div class="role-row">
                          <strong>${escapeHtml(monthLabel(item.month))}</strong>
                          <span>Generated ${escapeHtml(formatDateTime(new Date(item.generatedAt)))} by ${escapeHtml(item.generatedBy)} · ${item.metrics.total} matters</span>
                        </div>
                      `
                    )
                    .join("")}</div>`
                : `<div class="empty-state" style="min-height:220px"><p>No reports have been recorded yet.</p></div>`
            }
          </div>
          <footer class="modal-footer"><button class="btn" data-action="close-overlay">Close</button></footer>
        </section>
      </div>
    `;
  }

  function handleQualityFix(filter) {
    state.page = "matrix";
    state.statusFilter = filter === "status" ? "Unclassified" : "All";
    state.matrixSearch = "";
    render();
    if (filter !== "status") {
      showToast(
        filter === "expected" ? "Expected return dates" : "Priorities",
        "Open any matter to complete the highlighted control field."
      );
    }
  }

  function resetData() {
    if (!window.confirm("Reset all prototype changes and restore the supplied matrix sample?")) return;
    state.records = window.AUDITFLOW_SAMPLE_DATA.map((record) => ({ ...record }));
    state.reportHistory = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(REPORTS_KEY);
    } catch {
      // Ignore unavailable local storage.
    }
    render();
    showToast("Sample data restored", "The 14 imported matters are active again.");
  }

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      state.page = nav.dataset.nav;
      document.body.classList.remove("menu-open");
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const row = event.target.closest("[data-row-id]");
    if (row) {
      showRecord(row.dataset.rowId);
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (action === "close-overlay" && event.target.closest("[data-overlay-panel]") && !event.target.closest("button")) {
      return;
    }
    const actions = {
      "toggle-menu": () => document.body.classList.toggle("menu-open"),
      "close-overlay": closeOverlay,
      "add-matter": showAddMatter,
      "save-record": saveRecord,
      "create-record": createRecord,
      "delete-record": () => deleteRecord(actionTarget.dataset.id),
      "go-matrix": () => {
        state.page = "matrix";
        render();
      },
      "go-reports": () => {
        state.page = "reports";
        render();
      },
      "export-csv": exportCsv,
      "export-word": exportWord,
      "print-report": () => window.print(),
      "generate-report": generateReport,
      "save-draft": () => showToast("Draft saved", "Report settings and commentary remain active in this session."),
      "show-report-history": showReportHistory,
      "fix-quality": () => handleQualityFix(actionTarget.dataset.filter),
      "reset-data": resetData
    };
    actions[action]?.();
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    const change = target.dataset.change;
    if (change === "role") {
      state.role = target.value;
      render();
      showToast("Role changed", state.role === "Permanent Secretary" ? "Register editing is now disabled." : "Register editing is enabled.");
    } else if (change === "status-filter") {
      state.statusFilter = target.value;
      render();
    } else if (change === "officer-filter") {
      state.officerFilter = target.value;
      render();
    } else if (change === "age-filter") {
      state.ageFilter = target.value;
      render();
    } else if (change === "report-month") {
      state.reportMonth = target.value;
      render();
    } else if (target.dataset.reportOption) {
      state.reportOptions[target.dataset.reportOption] = target.checked;
      render();
    }
  });

  let inputTimer = 0;
  document.addEventListener("input", (event) => {
    const target = event.target;
    const input = target.dataset.input;
    if (!input) return;
    if (input === "commentary") {
      state.commentary = target.value;
      const counter = target.parentElement.querySelector(".char-count");
      if (counter) counter.textContent = `${state.commentary.length} / 500`;
      const paragraph = document.querySelector(".report-preview .report-section:last-child p");
      if (paragraph) paragraph.textContent = state.commentary || "No management commentary entered.";
      return;
    }
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => {
      const focusId = target.id;
      const cursor = target.selectionStart;
      if (input === "global-search") state.globalSearch = target.value;
      if (input === "matrix-search") state.matrixSearch = target.value;
      render();
      const restored = document.getElementById(focusId);
      if (restored) {
        restored.focus();
        restored.setSelectionRange(cursor, cursor);
      }
    }, 120);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOverlay();
      document.body.classList.remove("menu-open");
    }
  });

  render();
})();
