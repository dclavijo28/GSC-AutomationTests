export type ServiceNowEnvironment = "gsctest" | "gscdev";

type ServiceNowEnvironmentConfig = {
  baseUrl: string;
  loginUrl: string;
  storageStatePath: string;
};

const environmentDefaults: Record<ServiceNowEnvironment, { baseUrl: string; storageStatePath: string }> = {
  gsctest: {
    baseUrl: "https://sn-gsctest.churchofjesuschrist.org",
    storageStatePath: "playwright/.auth/gsctest-state.json",
  },
  gscdev: {
    baseUrl: "https://sn-gscdev.churchofjesuschrist.org",
    storageStatePath: "playwright/.auth/gscdev-state.json",
  },
};

export function serviceNowEnvironmentConfig(environment: ServiceNowEnvironment): ServiceNowEnvironmentConfig {
  const prefix = `SN_${environment.toUpperCase()}`;
  const defaults = environmentDefaults[environment];
  const baseUrl = normalizeUrl(process.env[`${prefix}_BASE_URL`] ?? defaults.baseUrl, `${prefix}_BASE_URL`);
  const storageStatePath = process.env[`${prefix}_STORAGE_STATE`] ?? defaults.storageStatePath;

  return {
    baseUrl,
    loginUrl: new URL("/login.do", baseUrl).toString(),
    storageStatePath,
  };
}

export function configuredUrl(variableName: string): string {
  const value = optionalConfiguredUrl(variableName);
  if (!value) {
    throw new Error(`Missing required test configuration: ${variableName}. Set it to the ServiceNow record or workspace URL before running this test.`);
  }

  return value;
}

export function optionalConfiguredUrl(variableName: string): string | undefined {
  const value = process.env[variableName]?.trim();
  return value ? normalizeUrl(value, variableName) : undefined;
}

function normalizeUrl(value: string, variableName: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are supported.");
    }
    return url.toString();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid URL";
    throw new Error(`${variableName} must be a valid HTTPS URL. ${reason}`);
  }
}
