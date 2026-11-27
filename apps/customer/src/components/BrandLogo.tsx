import { Image } from 'expo-image';

import { tenant } from '@/config/tenant';

/** The company's app icon (copied from tenants/<slug>/icon.png by app.config.ts). */
export function BrandLogo({ size = 88 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/tenant/logo.png')}
      style={{ width: size, height: size, borderRadius: size * 0.24, alignSelf: 'center' }}
      accessibilityLabel={`${tenant.name} logo`}
    />
  );
}
