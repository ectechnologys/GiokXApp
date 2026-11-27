import { useColorScheme } from 'react-native';

const light = { bg: '#ffffff', text: '#111418', muted: '#60646c', border: '#d9dce1', field: '#f3f4f6', danger: '#c62828' };
const dark = { bg: '#000000', text: '#f3f4f6', muted: '#a0a4ab', border: '#30333a', field: '#16181c', danger: '#ef5350' };

export function useColors() {
  return useColorScheme() === 'dark' ? dark : light;
}
