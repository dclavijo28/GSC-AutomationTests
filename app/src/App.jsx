import { useEffect, useState } from "react";
import "./App.css";

const POLL_MS = 2000;
const EMPTY_AUTH = {
  status: "idle",
  message: "GSCTEST auth refresh is idle.",
  details: [],
};

function App() {
  const [tests, setTests] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auth, setAuth] = useState(EMPTY_AUTH);
  const [runState, setRunState] = useState(null);
  const [runBusy, setRunBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [runError, setRunError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function hydrate() {
      await Promise.all([
        loadTests(isActive),
        refreshAuthState(isActive),
        refreshRunState(isActive),
      ]);
    }

    hydrate();

    const timer = window.setInterval(() => {
      refreshAuthState(isActive);
      refreshRunState(isActive);
    }, POLL_MS);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedSet = new Set(selectedIds);
  const filteredTests = tests.filter((test) => {
    const haystack = `${test.title} ${test.suite} ${test.file}`.toLowerCase();
    return !searchQuery || haystack.includes(searchQuery.toLowerCase());
  });

  async function loadTests(isActive = true) {
    try {
      const data = await api("/api/tests");
      if (!isActive) return;
      setTests(data.tests);
      setSelectedIds((current) => current.filter((id) => data.tests.some((test) => test.id === id)));
    } catch (error) {
      if (!isActive) return;
      setRunError(error.message);
    }
  }

  async function refreshAuthState(isActive = true) {
    try {
      const data = await api("/api/auth");
      if (!isActive || !data?.auth) return;
      setAuth(data.auth);
    } catch {
      if (!isActive) return;
      setAuth((current) => current ?? EMPTY_AUTH);
    }
  }

  async function refreshRunState(isActive = true) {
    try {
      const data = await api("/api/run");
      if (!isActive) return;
      setRunState(data.activeRun || data.lastRun || null);
      setRunBusy(Boolean(data.activeRun));
    } catch (error) {
      if (!isActive) return;
      setRunError(error.message);
      setRunBusy(false);
    }
  }

  async function startAuthRefresh() {
    setAuthBusy(true);
    try {
      const data = await api("/api/auth/start", { method: "POST", body: {} });
      if (data?.auth) setAuth(data.auth);
    } catch (error) {
      setAuth({ status: "failed", message: error.message, details: [] });
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveAuthRefresh() {
    setAuthBusy(true);
    try {
      const data = await api("/api/auth/save", { method: "POST", body: {} });
      if (data?.auth) setAuth(data.auth);
    } catch (error) {
      setAuth({ status: "failed", message: error.message, details: [] });
    } finally {
      setAuthBusy(false);
    }
  }

  async function cancelAuthRefresh() {
    setAuthBusy(true);
    try {
      const data = await api("/api/auth/cancel", { method: "POST", body: {} });
      if (data?.auth) setAuth(data.auth);
    } catch (error) {
      setAuth({ status: "failed", message: error.message, details: [] });
    } finally {
      setAuthBusy(false);
    }
  }

  async function runTests(payload) {
    const selectedTests = testsForPayload(payload);
    if (!selectedTests.length) {
      setRunError("Select at least one test to run.");
      return;
    }

    if (selectedTests.some((test) => test.writesGsctest)) {
      const confirmed = window.confirm(
        "### GSCTEST ### This run creates or updates ServiceNow records in GSCTEST. Proceed?"
      );
      if (!confirmed) return;
      payload.confirmGsctestWrites = true;
    }

    setRunBusy(true);
    setRunError("");

    try {
      const data = await api("/api/run", { method: "POST", body: payload });
      if (data?.run) {
        setRunState(data.run);
      }
    } catch (error) {
      setRunError(error.message);
      setRunBusy(false);
    }
  }

  async function rerunLast() {
    const selectedTests = runState?.selectedTests || [];
    const writesGsctest = selectedTests.some((test) => test.writesGsctest);

    if (writesGsctest) {
      const confirmed = window.confirm(
        "### GSCTEST ### This rerun creates or updates ServiceNow records in GSCTEST. Proceed?"
      );
      if (!confirmed) return;
    }

    setRunBusy(true);
    setRunError("");

    try {
      const data = await api("/api/rerun", {
        method: "POST",
        body: { confirmGsctestWrites: writesGsctest },
      });
      if (data?.run) {
        setRunState(data.run);
      }
    } catch (error) {
      setRunError(error.message);
      setRunBusy(false);
    }
  }

  function testsForPayload(payload) {
    if (payload.all) return tests;
    const ids = new Set(payload.ids || []);
    return tests.filter((test) => ids.has(test.id));
  }

  function toggleSelection(id, checked) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((currentId) => currentId !== id);
    });
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const merged = new Set(current);
      filteredTests.forEach((test) => merged.add(test.id));
      return [...merged];
    });
  }

  function selectAll() {
    setSelectedIds(tests.map((test) => test.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  const displayedRun = runState;
  const reportHref = displayedRun?.reportUrl || "/report/index.html";

  return (
    <div className="app-shell">
      <header className="topbar" aria-label="Principal menu">
        <div className="topbar-copy">
          <p className="eyebrow">Story 001</p>
          <h1>GSC Regression Runner</h1>
          <p className="topbar-subtitle">
            Web app for selecting and running sprint regression candidates.
          </p>
        </div>
        <nav className="topbar-actions" aria-label="Principal menu actions">
          <button
            className="button primary"
            type="button"
            onClick={startAuthRefresh}
            disabled={authBusy || auth.status === "open"}
          >
            Refresh Connection
          </button>
          <a className="button secondary" href={reportHref} target="_blank" rel="noreferrer">
            Official Playwright Report
          </a>
        </nav>
      </header>

      <section className="panel controls" aria-label="ServiceNow connection and test selection">
        <div className="section-header">
          <div>
            <h2>ServiceNow Connection</h2>
            <p className="muted">
              Use Refresh Connection when the GSCTEST session expires and you need to sign in again.
            </p>
          </div>
          <div className="inline-actions">
            <button
              className="button secondary"
              type="button"
              onClick={saveAuthRefresh}
              disabled={authBusy || auth.status !== "open"}
            >
              Save Connection
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={cancelAuthRefresh}
              disabled={authBusy || auth.status !== "open"}
            >
              Cancel
            </button>
          </div>
        </div>

        <div className={`auth-status ${auth.status || "idle"}`}>
          <strong>{titleCase(auth.status || "idle")}</strong>
          <span>{auth.message || ""}</span>
          {auth.details?.length ? (
            <details className="secure-details">
              <summary>Show session details</summary>
              <dl>
                {auth.details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </div>

        <div className="section-header section-gap">
          <div>
            <h2>Test Selection</h2>
            <p className="muted">Search, filter, and choose the tests for the current sprint run.</p>
          </div>
          <button className="button ghost" type="button" onClick={() => loadTests(true)}>
            Refresh Test List
          </button>
        </div>

        <label className="search-label" htmlFor="searchInput">
          Search tests
        </label>
        <input
          id="searchInput"
          type="search"
          placeholder="Search by test name, suite, or file"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <div className="selection-row">
          <span>{selectedIds.length} selected</span>
          <button className="button ghost" type="button" onClick={selectVisible}>
            Select visible
          </button>
          <button className="button ghost" type="button" onClick={selectAll}>
            Select all
          </button>
          <button className="button ghost" type="button" onClick={clearSelection}>
            Clear
          </button>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel" aria-label="Available tests">
          <div className="panel-header">
            <h2>Available Tests</h2>
            <span className="muted">
              {filteredTests.length} of {tests.length} tests
            </span>
          </div>

          <div className="test-list">
            {filteredTests.length ? (
              filteredTests.map((test) => (
                <label className="test-card" key={test.id}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(test.id)}
                    onChange={(event) => toggleSelection(test.id, event.target.checked)}
                  />
                  <span>
                    <span className="test-title">{test.title}</span>
                    {test.writesGsctest ? <span className="test-badge danger">Writes GSCTEST</span> : null}
                    <span className="test-meta">{test.suite}</span>
                    <br />
                    <span className="test-meta">{test.path}</span>
                  </span>
                </label>
              ))
            ) : (
              <p className="muted">No tests match your search.</p>
            )}
          </div>
        </section>

        <section className="panel" aria-label="Run results">
          <div className="panel-header">
            <h2>Run</h2>
            <span className={`status ${displayedRun?.status || "idle"}`}>
              {titleCase(displayedRun?.status || "idle")}
            </span>
          </div>

          <div className="run-actions">
            <button className="button primary" type="button" onClick={() => runTests({ ids: selectedIds })} disabled={runBusy}>
              Run selected
            </button>
            <button className="button secondary" type="button" onClick={() => runTests({ all: true })} disabled={runBusy}>
              Run all
            </button>
            <button className="button secondary" type="button" onClick={rerunLast} disabled={runBusy || !displayedRun}>
              Rerun last
            </button>
          </div>

          <div className="summary">
            {displayedRun?.summary?.error ? (
              <p className="muted">{displayedRun.summary.error}</p>
            ) : displayedRun?.summary ? (
              <>
                <div className="summary-grid">
                  <Metric label="Total" value={displayedRun.summary.total} />
                  <Metric label="Passed" value={displayedRun.summary.passed} />
                  <Metric label="Failed" value={displayedRun.summary.failed} />
                  <Metric label="Skipped" value={displayedRun.summary.skipped} />
                </div>
                <div>
                  {displayedRun.summary.cases.map((test) => (
                    <div className="case-row" key={`${test.title}-${test.file}-${test.line}`}>
                      <strong>{test.title}</strong>
                      <br />
                      <span className="muted">
                        {test.status || test.outcome} · {Math.round((test.duration || 0) / 100) / 10}s
                      </span>
                      {test.error ? <pre>{test.error}</pre> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">
                {displayedRun?.startedAt
                  ? `Run started at ${formatDate(displayedRun.startedAt)}.`
                  : "No run yet."}
              </p>
            )}
          </div>

          <h3>Console Output</h3>
          <pre className="output">
            {runError || [displayedRun?.stdout, displayedRun?.stderr].filter(Boolean).join("\n") || "No run yet."}
          </pre>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value ?? 0}</strong>
      {label}
    </div>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

export default App;
