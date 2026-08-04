# GSC-AutomationTests

Automation tests for GSC ServiceNow workflows.

## Branch And PR Strategy

Use one branch per automation story or feature.

Recommended names:

- `GSCTEST-CSAS-Sidebar`
- `GSCTEST-LUS-case-with-GSD-Genesys`
- `GSCTEST-STRY0482100-Genesys`
- `GSCTEST-<short-feature-name>`

Important rule:

- always create new story branches from `main`
- avoid starting a new story branch from another feature branch unless that dependency is intentional

What can go in a story branch:

- the Playwright test for that story
- helper updates required for that story
- regression app updates needed to run or manage that story test
- small documentation updates related to that work

What should stay out of a story branch:

- unrelated story work
- broad refactors not needed for the story
- multiple unfinished features mixed into one PR

What belongs in `main`:

- stable regression app behavior
- stable shared helpers
- stable Playwright configuration
- stable tests ready for normal team use

Recommended workflow:

1. Update local `main`.
2. Create a new story branch from `main`.
3. Build the automation test.
4. Run and verify locally.
5. Push the branch to GitHub.
6. Open a PR with the story summary.
7. Continue polishing on the same branch.
8. Merge only when the shared version is clean enough for `main`.

To avoid losing code:

- push every story branch to GitHub
- open a PR for each meaningful story branch
- keep branches until the story history is no longer needed
- avoid doing long-running work only in a local branch

## Playwright Setup

The shared Playwright configuration matches the ServiceNow workspace checks used from WebStorm:

- TypeScript specs under `tests/e2e`
- headed Chrome by default
- one worker, because the tests reuse one local MFA-backed ServiceNow auth state
- local storage state at `playwright/.auth/gsctest-state.json`

## Local Auth State

Keep ServiceNow auth state local. It must not be committed to GitHub.

Expected local file:

```powershell
playwright/.auth/gsctest-state.json
```

Create or refresh it with:

```powershell
npm run auth:gsctest
```

You can also set `SN_GSCTEST_STORAGE_STATE` to another local auth-state file before running tests.

## Test Configuration

ServiceNow record and workspace URLs are deliberately kept out of the test source. The CSAS sidebar test automatically selects the newest active CSLUS and CSAS records from GSCTEST using your signed-in session. Copy `.env.example` to `.env` for reference, then set values in your PowerShell or WebStorm run configuration only when you need to target specific records. Do not commit `.env`.

To override automatic selection for the CSAS sidebar test, configure a valid baseline and target record:

```powershell
$env:SN_GSCTEST_CSLUS_CASE_URL = "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/<cslus-table>/<baseline-sys-id>"
$env:SN_GSCTEST_CSAS_CASE_URL = "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/<csas-table>/<target-sys-id>"
```

Optional instance overrides are available through `SN_GSCTEST_BASE_URL`, `SN_GSCDEV_BASE_URL`, `SN_GSCDEV_IN_APP_CASE_URL`, and `SN_GSCDEV_OPEN_CASES_LIST_URL`.

## Run From WebStorm

1. Run `npm install`.
2. Run `npm run auth:gsctest` if `playwright/.auth/gsctest-state.json` does not exist or redirects to MFA.
3. Create a WebStorm Playwright run configuration:
   - Configuration file: `playwright.config.ts`
   - Test directory: `tests/e2e`
   - Working directory: repository root
4. Run `tests/e2e/csas-case-sidebar.spec.ts`, or use the npm script below.

## Regression Runner App

Run the local regression app when you want to search, select, run, rerun, and review tests from a browser:

```powershell
npm run app
```

Then open:

```text
http://localhost:4555
```

The app is web-based, lists tests from `tests/e2e`, supports selected or full regression runs, shows the latest console output, and links to the official Playwright HTML report at `/report/index.html`.

Story 001 currently covers:

- top menu title `GSC Regression Runner`
- top menu actions for `Refresh Connection` and `Official Playwright Report`
- local browser-based regression execution against the shared Playwright suite

The deeper interactive ServiceNow workflow will be expanded later. Today the app already supports refreshing the GSCTEST auth session from the browser flow.

If a run says the saved GSCTEST auth state redirected to MFA, use the app buttons:

1. Click `Refresh GSCTEST Auth`.
2. Complete login and MFA in the Chrome window that opens.
3. Return to the app and click `Save Auth`.
4. Rerun the test.

Tests that create or update ServiceNow records must require an explicit confirmation token before they are added to the regression suite. The current CSAS sidebar checks are read-only.

## Current Coverage

`tests/e2e/csas-case-sidebar.spec.ts` selects active CSLUS and CSAS cases and validates that they expose the same sidebar tools and action behavior. Set `SN_GSCTEST_CSLUS_CASE_URL` and `SN_GSCTEST_CSAS_CASE_URL` only to run against specific records.
## Commands

```powershell
npm run auth:gsctest
npm run app
npm run test:e2e
npm run test:csas-sidebar
```
