import { NativeTabs } from 'expo-router/native-tabs';

import { accent, gray } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <NativeTabs backgroundColor="#ffffff" indicatorColor="rgba(195,164,111,0.18)" iconColor={{ default: gray[400], selected: accent }}
      labelStyle={{ default: { color: gray[500] }, selected: { color: accent } }}>
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
