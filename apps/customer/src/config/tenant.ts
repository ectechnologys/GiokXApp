import Constants from 'expo-constants';

import type { TenantConfig } from '../../app.config';

/** The company this build of the app belongs to (set by app.config.ts). */
export const tenant = Constants.expoConfig?.extra?.tenant as TenantConfig;

if (!tenant?.host) {
  throw new Error('Tenant config missing: app.config.ts did not set extra.tenant');
}
