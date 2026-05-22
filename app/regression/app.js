const state = {
  tests: [],
  filtered: [],
  selected: new Set(),
  auth: null,
  hasRunInPage: false,
  pollTimer: null
};

const elements = {
  searchInput: document.querySelector("#searchInput"),
  testList: document.querySelector("#testList"),
  testCount: document.querySelector("#testCount"),
  selectionCount: document.querySelector("#selectionCount"),
  selectVisible: document.querySelector("#selectVisible"),
  selectAll: document.querySelector("#selectAll"),
  clearSelection: document.querySelector("#clearSelection"),
  refreshTests: document.querySelector("#refreshTests"),
  startAuth: document.querySelector("#startAuth"),
  saveAuth: document.querySelector("#saveAuth"),
  cancelAuth: document.querySelector("#cancelAuth"),
  authStatus: document.querySelector("#authStatus"),
  runSelected: document.querySelector("#runSelected"),
  runAll: document.querySelector("#runAll"),
  rerunLast: document.querySelector("#rerunLast"),
  runStatus: document.querySelector("#runStatus"),
  summary: document.querySelector("#summary"),
  output: document.querySelector("#output"),
  reportLink: document.querySelector("#reportLink")
};

await loadTests();
await refreshAuthState();
await refreshRunState();

setInterval(refreshRunState, 2_000);
setInterval(refreshAuthState, 2_000);

elements.searchInput.addEventListener("input", () => renderTests());
elements.refreshTests.addEventListener("click", loadTests);
elements.selectVisible.addEventListener("click", () => {
  for (const test of state.filtered) state.selected.add(test.id);
  renderTests();
});
elements.selectAll.addEventListener("click", () => {
  for (const test of state.tests) state.selected.add(test.id);
  renderTests();
});
elements.clearSelection.addEventListener("click", () => {
  state.selected.clear();
  renderTests();
});
elements.runSelected.addEventListener("click", () => runTests({ ids: [...state.selected] }));
elements.runAll.addEventListener("click", () => runTests({ all: true }));
elements.rerunLast.addEventListener("click", () => rerunLast());
elements.startAuth.addEventListener("click", startAuthRefresh);
elements.saveAuth.addEventListener("click", saveAuthRefresh);
elements.cancelAuth.addEventListener("click", cancelAuthRefresh);

async function loadTests() {
  elements.testCount.textContent = "Loading...";
  elements.testList.innerHTML = "";
  const data = await api("/api/tests");
  state.tests = data.tests;
  state.selected = new Set([...state.selected].filter((id) => state.tests.some((test) => test.id === id)));
  renderTests();
}

function renderTests() {
  const query = elements.searchInput.value.trim().toLowerCase();
  state.filtered = state.tests.filter((test) => {
    const haystack = `${test.title} ${test.suite} ${test.file}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  elements.testCount.textContent = `${state.filtered.length} of ${state.tests.length} tests`;
  elements.selectionCount.textContent = `${state.selected.size} selected`;

  if (!state.filtered.length) {
    elements.testList.innerHTML = `<p class="muted">No tests match your search.</p>`;
    return;
  }

  elements.testList.innerHTML = state.filtered.map((test) => `
    <label class="test-card">
      <input type="checkbox" data-test-id="${escapeHtml(test.id)}" ${state.selected.has(test.id) ? "checked" : ""}>
        <span>
          <span class="test-title">${escapeHtml(test.title)}</span>
          ${test.writesGsctest ? `<span class="test-badge danger">Writes GSCTEST</span>` : ""}
          <span class="test-meta">${escapeHtml(test.suite)}</span><br>
          <span class="test-meta">${escapeHtml(test.path)}</span>
        </span>
    </label>
  `).join("");

  elements.testList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(checkbox.dataset.testId);
      else state.selected.delete(checkbox.dataset.testId);
      elements.selectionCount.textContent = `${state.selected.size} selected`;
    });
  });
}

async function runTests(payload) {
  const selectedTests = testsForPayload(payload);
  if (selectedTests.some((test) => test.writesGsctest)) {
    const confirmed = window.confirm(
      "### GSCTEST ### This run creates or updates ServiceNow records in GSCTEST. Proceed?"
    );
    if (!confirmed) return;
    payload.confirmGsctestWrites = true;
  }

  setBusy(true);
  const data = await api("/api/run", { method: "POST", body: payload }).catch((error) => {
    showError(error.message);
    setBusy(false);
    return null;
  });

  if (data?.run) {
    state.hasRunInPage = true;
    renderRun(data.run);
  }
}

async function rerunLast() {
  const selectedTests = state.lastRun?.selectedTests || [];
  if (selectedTests.some((test) => test.writesGsctest)) {
    const confirmed = window.confirm(
      "### GSCTEST ### This rerun creates or updates ServiceNow records in GSCTEST. Proceed?"
    );
    if (!confirmed) return;
  }

  setBusy(true);
  const data = await api("/api/rerun", {
    method: "POST",
    body: { confirmGsctestWrites: selectedTests.some((test) => test.writesGsctest) }
  }).catch((error) => {
    showError(error.message);
    setBusy(false);
    return null;
  });

  if (data?.run) {
    state.hasRunInPage = true;
    renderRun(data.run);
  }
}

async function startAuthRefresh() {
  setAuthBusy(true);
  const data = await api("/api/auth/start", { method: "POST", body: {} }).catch((error) => {
    showAuthError(error.message);
    return null;
  });
  if (data?.auth) renderAuth(data.auth);
  setAuthBusy(false);
}

async function saveAuthRefresh() {
  setAuthBusy(true);
  const data = await api("/api/auth/save", { method: "POST", body: {} }).catch((error) => {
    showAuthError(error.message);
    return null;
  });
  if (data?.auth) renderAuth(data.auth);
  setAuthBusy(false);
}

async function cancelAuthRefresh() {
  setAuthBusy(true);
  const data = await api("/api/auth/cancel", { method: "POST", body: {} }).catch((error) => {
    showAuthError(error.message);
    return null;
  });
  if (data?.auth) renderAuth(data.auth);
  setAuthBusy(false);
}

async function refreshAuthState() {
  const data = await api("/api/auth").catch(() => null);
  if (data?.auth) renderAuth(data.auth);
}

async function refreshRunState() {
  const data = await api("/api/run");
  state.lastRun = data.lastRun;
  if (data.activeRun) {
    state.hasRunInPage = true;
  }

  const run = data.activeRun || (state.hasRunInPage ? data.lastRun : null);
  if (run) renderRun(run);
  else renderEmptyRun();

  setBusy(Boolean(data.activeRun));
}

function testsForPayload(payload) {
  if (payload.all) return state.tests;

  const ids = new Set(payload.ids || []);
  return state.tests.filter((test) => ids.has(test.id));
}

function renderEmptyRun() {
  elements.runStatus.textContent = "Idle";
  elements.runStatus.className = "status idle";
  elements.reportLink.href = "/report/index.html";
  elements.summary.innerHTML = "";
  elements.output.textContent = "No run yet.";
}

function renderRun(run) {
  elements.runStatus.textContent = titleCase(run.status);
  elements.runStatus.className = `status ${run.status || "idle"}`;
  elements.output.textContent = [run.stdout, run.stderr].filter(Boolean).join("\n") || "Waiting for output...";
  elements.reportLink.href = run.reportUrl || "/report/index.html";

  if (!run.summary) {
    elements.summary.innerHTML = `<p class="muted">Run started at ${formatDate(run.startedAt)}.</p>`;
    return;
  }

  if (run.summary.error) {
    elements.summary.innerHTML = `<p class="muted">${escapeHtml(run.summary.error)}</p>`;
    return;
  }

  elements.summary.innerHTML = `
    <div class="summary-grid">
      ${metric("Total", run.summary.total)}
      ${metric("Passed", run.summary.passed)}
      ${metric("Failed", run.summary.failed)}
      ${metric("Skipped", run.summary.skipped)}
    </div>
    <div>
      ${run.summary.cases.map((test) => `
        <div class="case-row">
          <strong>${escapeHtml(test.title)}</strong><br>
          <span class="muted">${escapeHtml(test.status || test.outcome)} · ${Math.round((test.duration || 0) / 100) / 10}s</span>
          ${test.error ? `<pre>${escapeHtml(test.error)}</pre>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderAuth(auth) {
  state.auth = auth;
  const isOpen = auth.status === "open";
  elements.startAuth.disabled = isOpen;
  elements.saveAuth.disabled = !isOpen;
  elements.cancelAuth.disabled = !isOpen;
  elements.authStatus.className = `auth-status ${auth.status || "idle"}`;
  elements.authStatus.innerHTML = `
    <strong>${escapeHtml(titleCase(auth.status || "idle"))}</strong>
    <span>${escapeHtml(auth.message || "")}</span>
    ${auth.details?.length ? secureDetails(auth.details) : ""}
  `;
}

function secureDetails(details) {
  return `
    <details class="secure-details">
      <summary>Show session details</summary>
      <dl>
        ${details.map((detail) => `
          <div>
            <dt>${escapeHtml(detail.label)}</dt>
            <dd>${escapeHtml(detail.value)}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

function metric(label, value) {
  return `<div class="metric"><strong>${escapeHtml(String(value ?? 0))}</strong>${escapeHtml(label)}</div>`;
}

function setBusy(isBusy) {
  elements.runSelected.disabled = isBusy;
  elements.runAll.disabled = isBusy;
  elements.rerunLast.disabled = isBusy;
}

function setAuthBusy(isBusy) {
  if (!isBusy) {
    renderAuth(state.auth || { status: "idle", message: "GSCTEST auth refresh is idle." });
    return;
  }

  elements.startAuth.disabled = true;
  elements.saveAuth.disabled = true;
  elements.cancelAuth.disabled = true;
}

function showError(message) {
  elements.runStatus.textContent = "Failed";
  elements.runStatus.className = "status failed";
  elements.output.textContent = message;
}

function showAuthError(message) {
  renderAuth({ status: "failed", message });
  setAuthBusy(false);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function titleCase(value) {
  return (value || "idle").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[char]));
}
