/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';

/**
 * One codebase, one branded app per cleaning company.
 *
 * Pick the company with the TENANT environment variable (default: chiams):
 *   TENANT=chiams npx expo start
 * Each company lives in tenants/<slug>/: tenant.json plus, optionally, its own
 * icon.png / adaptive-icon.png / splash.png. Missing images fall back to the
 * shared ones in assets/images.
 */
export interface TenantConfig {
  slug: string;
  name: string;
  /** tenants.id — for reading the company's public settings. */
  tenantId: string;
  /** The tenant's web address. The backend identifies the company by it. */
  host: string;
  androidPackage: string;
  iosBundleId: string;
  scheme: string;
  primaryColor: string;
  /** Website accent (tenant_site.theme.accent): account + booking pages. */
  accent?: string;
  /** Adaptive-icon background behind the logo (default: primaryColor). */
  iconBackground?: string;
  version: string;
}

const slug = process.env.TENANT ?? 'chiams';
const dir = path.join(__dirname, 'tenants', slug);
const file = path.join(dir, 'tenant.json');
if (!fs.existsSync(file)) {
  throw new Error(`Unknown tenant "${slug}": ${file} does not exist.`);
}
const tenant: TenantConfig = JSON.parse(fs.readFileSync(file, 'utf8'));

// The screens show the company's logo too. Metro can only bundle images it
// can see at a fixed path, so the tenant's icon is copied to assets/tenant/
// (git-ignored, regenerated on every start / build).
fs.mkdirSync(path.join(__dirname, 'assets', 'tenant'), { recursive: true });
const tenantImage = (name: string, fallback: string) =>
  fs.copyFileSync(
    fs.existsSync(path.join(dir, name)) ? path.join(dir, name) : path.join(__dirname, 'assets', 'images', fallback),
    path.join(__dirname, 'assets', 'tenant', name === 'icon.png' ? 'logo.png' : name),
  );
tenantImage('icon.png', 'icon.png');
// The company's wide logo (as on its website); falls back to the square icon.
tenantImage('wordmark.png', 'icon.png');

/** Tenant's own image if it has one, otherwise the shared default. */
const asset = (name: string, fallback: string) =>
  fs.existsSync(path.join(dir, name)) ? `./tenants/${slug}/${name}` : `./assets/images/${fallback}`;

const config: ExpoConfig = {
  name: tenant.name,
  slug: `giokx-${tenant.slug}`,
  version: tenant.version,
  orientation: 'portrait',
  icon: asset('icon.png', 'icon.png'),
  scheme: tenant.scheme,
  // The website is light-only; the app matches it.
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: tenant.iosBundleId,
  },
  android: {
    package: tenant.androidPackage,
    adaptiveIcon: {
      backgroundColor: tenant.iconBackground ?? tenant.primaryColor,
      foregroundImage: asset('adaptive-icon.png', 'android-icon-foreground.png'),
      monochromeImage: asset('adaptive-icon-monochrome.png', 'android-icon-monochrome.png'),
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: `${tenant.name} uses your photos so you can share pictures of the areas to clean.`,
        cameraPermission: `${tenant.name} uses the camera so you can share pictures of the areas to clean.`,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: `${tenant.name} uses your location to fill in your address so our team can find you.`,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: tenant.primaryColor,
        image: asset('splash.png', 'splash-icon.png'),
        imageWidth: 200,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: { tenant },
};

export default config;
