// The web chat wallpaper (chatWorkspace.css --cw-pattern): dots, small chat
// bubbles and cleaning sparkles on a 140 px tile, over --cw-bg.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import { cw } from '@/components/chatUi';

const INK = '#d8e2f0';

export const Wallpaper = memo(function Wallpaper() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: cw.bg, pointerEvents: 'none' }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="cw-wall" patternUnits="userSpaceOnUse" x={0} y={0} width={140} height={140}>
            <G fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 18h22a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-14l-7 6v-6h-1a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z" />
              <Path d="M98 70l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
              <Path d="M118 22l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
              <Circle cx={70} cy={30} r={1.6} fill={INK} />
              <Circle cx={40} cy={100} r={1.6} fill={INK} />
              <Circle cx={128} cy={118} r={1.6} fill={INK} />
              <Path d="M30 120l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
              <Path d="M82 108h18a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-1v5l-6-5h-11a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z" />
              <Circle cx={12} cy={70} r={1.6} fill={INK} />
            </G>
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cw-wall)" />
      </Svg>
    </View>
  );
});
