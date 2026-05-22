# GSC-AutomationTests

Automation tests for GSC ServiceNow workflows.

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

The app lists tests from `tests/e2e`, supports selected or full regression runs, shows the latest console output, and links to the official Playwright HTML report at `/report/index.html`.

If a run says the saved GSCTEST auth state redirected to MFA, use the app buttons:

1. Click `Refresh GSCTEST Auth`.
2. Complete login and MFA in the Chrome window that opens.
3. Return to the app and click `Save Auth`.
4. Rerun the test.

Tests marked `Writes GSCTEST` create or update records in ServiceNow GSCTEST. The app asks for explicit confirmation before running them. From PowerShell, set the confirmation token before running a write-capable test directly:

```powershell
$env:CONFIRM_GSCTEST_WRITES = "GSCTEST"
npm run test:genesys-inapp
```

## Current Coverage

`tests/e2e/csas-case-sidebar.spec.ts` opens the CSLUS case type as the baseline and then validates the CSAS case type against the same sidebar tools and action behavior.

`tests/e2e/genesys-inapp-case.spec.ts` creates a LUS case with Short description `Test Automation STRY0482100`, Assignment group `GSD-Genesys`, Reply to `mlssupport@churchofjesuschrist.org`, saves it, selects the `Debeach` consumer, sets Channel `In-App`, saves again, finds the created case from the open cases list, validates that the Genesys Call ID is populated, and attaches a final screenshot.

Baseline CSLUS case:

```text
https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/x_tcoj2_church_ct_case_lus/1ff3fdeb47ec8f10514da04f116d432f
```

Target CSAS case:

```text
https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/x_tcoj2_church_ct_case_as/9ee8658993accf10dd89b43efaba1075
```
## Commands

```powershell
npm run auth:gsctest
npm run app
npm run test:e2e
npm run test:csas-sidebar
npm run test:genesys-inapp
```
