const environments = {
  gsctest: {
    label: 'GSCTEST',
    loginUrl: 'https://sn-gsctest.churchofjesuschrist.org/login.do',
    homeUrl: 'https://sn-gsctest.churchofjesuschrist.org/now/nav/ui/classic/params/target/home.do',
    storageStatePath: 'playwright/.auth/gsctest-state.json'
  },
  gscdev: {
    label: 'GSCDEV',
    loginUrl: 'https://sn-gscdev.churchofjesuschrist.org/login.do',
    homeUrl: 'https://sn-gscdev.churchofjesuschrist.org/now/nav/ui/classic/params/target/home.do',
    storageStatePath: 'playwright/.auth/gscdev-state.json'
  }
};

export function getServiceNowEnvironmentConfig(environment = 'gsctest') {
  const normalized = String(environment || 'gsctest').toLowerCase();
  const config = environments[normalized];
  if (!config) {
    throw new Error(`Unsupported ServiceNow environment: ${environment}`);
  }

  return { environment: normalized, ...config };
}
