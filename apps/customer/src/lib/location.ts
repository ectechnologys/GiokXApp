import * as Location from 'expo-location';

export interface Located {
  lat: number;
  lng: number;
  address: string;
  postcode: string;
  city: string;
}

/** Best position the phone will give. High accuracy first; Android refuses it
 *  ("unsatisfied device settings") when the customer says No thanks to
 *  Google's Location Accuracy prompt, so fall back to plain GPS without
 *  asking again, then to the last known fix. */
async function position(): Promise<Location.LocationObject> {
  try {
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    try {
      return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
    } catch {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
      if (last) return last;
      throw new Error('Couldn’t find your location right now. Please type your address instead.');
    }
  }
}

/** The phone's GPS position plus a street address for it (the phone's own
 *  geocoder: free, no Google key). Throws a customer-readable message. */
export async function currentAddress(): Promise<Located> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Location permission was not given. You can type your address instead.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location is turned off on this phone. Turn it on in Settings, or type your address instead.');
  }
  const pos = await position();
  const { latitude: lat, longitude: lng } = pos.coords;

  let a: Location.LocationGeocodedAddress | undefined;
  try {
    [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  } catch {
    a = undefined;
  }
  const street = [a?.streetNumber, a?.street].filter(Boolean).join(' ');
  const parts = [a?.name && a.name !== a?.streetNumber && a.name !== street ? a.name : null, street, a?.district];
  const address = parts.filter((p, i, all): p is string => !!p && all.indexOf(p) === i).join(', ');

  return {
    lat,
    lng,
    address: address || a?.formattedAddress || '',
    postcode: a?.postalCode ?? '',
    city: a?.city ?? a?.subregion ?? '',
  };
}
