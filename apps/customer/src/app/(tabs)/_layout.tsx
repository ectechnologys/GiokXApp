import { NativeTabs } from 'expo-router/native-tabs';

import { tenant } from '@/config/tenant';
import { useColors } from '@/lib/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <NativeTabs backgroundColor={c.bg} iconColor={{ default: c.muted, selected: tenant.primaryColor }}
      labelStyle={{ default: { color: c.muted }, selected: { color: tenant.primaryColor } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Bookings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="event_note" sf="calendar" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="book">
        <NativeTabs.Trigger.Label>Book</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="add_circle" sf="plus.circle" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="person" sf="person.crop.circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
