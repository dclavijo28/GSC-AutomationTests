# GSC Regression Runner Web Client

This React client is the front-end workspace for the regression runner.

## Local Development

1. From the repository root, start the runner backend:

```powershell
npm run app
```

2. In this `app` folder, start the Vite client:

```powershell
npm run dev
```

3. Open the local URL shown by Vite.

The Vite dev server proxies `/api` and `/report` to the regression runner backend at `http://localhost:4555`.

## Story 001 Coverage

- The app is web-based.
- The top menu is titled `GSC Regression Runner`.
- The top menu includes `Refresh Connection` and `Official Playwright Report`.
- The runner uses the shared GitHub repository source and backend APIs from the root project.

The interactive ServiceNow workflow will continue to expand in later stories.
