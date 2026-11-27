# GiokX Mobile

Native mobile apps for GiokX (React Native + Expo). Backend: the Supabase project
from the web repo `GiokX-SaaS-Project`.

| App | Folder | Who | Status |
|---|---|---|---|
| Branded customer app (one per company, e.g. "Chiam's Cleaning") | `apps/customer` | Customers | Started |
| GiokX Business (shared) | `apps/business` | Tenant admins + staff | Later |

## Run the customer app

```bash
npm install
cd apps/customer
TENANT=chiams npx expo start
```

Press `a` to open it in the Android emulator, or scan the QR code with Expo Go on
an Android phone.

## Add a company

1. Create `apps/customer/tenants/<slug>/tenant.json` (copy `chiams`, change name,
   host, package id, colour).
2. Optionally add `icon.png` (1024×1024), `adaptive-icon.png` and `splash.png`
   in the same folder. Missing ones fall back to `assets/images`.
3. Build with `TENANT=<slug>`.

The app sends the company's web address (`host`) with every backend call, the
same way the web portal does, so no server change is needed per company.

## Build the real (standalone) Android app

Needs Android Studio installed (it brings Java and the Android SDK).

```bash
cd apps/customer
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME=~/Library/Android/sdk TENANT=chiams
npx expo prebuild --platform android --no-install
cd android && NODE_ENV=production ./gradlew assembleRelease
```

The APK lands in `apps/customer/android/app/build/outputs/apk/release/app-release.apk`
(install with `adb install -r <apk>`). `android/` is generated — never edit it by
hand; change `app.config.ts` / `tenants/<slug>/` and prebuild again.

This build is signed with the debug key: fine for testing, NOT for the Play Store.
A Play Store release needs an upload key and an `.aab` (`./gradlew bundleRelease`).

Company images live in `tenants/<slug>/`: `icon.png` (1024², launcher + in-app
logo), `adaptive-icon.png` / `adaptive-icon-monochrome.png` (logo on transparent,
inside the middle ~64%), `splash.png` (square, logo within the middle ~60%), plus
`iconBackground` in `tenant.json`.
