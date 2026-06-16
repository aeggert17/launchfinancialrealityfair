import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useDebugContext } from '@/contexts/DebugContext';

const MONO_FONT = Platform.OS === 'ios' ? 'Courier' : 'monospace';
const AMBER = '#F59E0B';
const BG = 'rgba(0,0,0,0.88)';

export function TestModeDebugPanel() {
  const { isTestMode, debugEntries, clearDebug } = useDebugContext();

  if (!isTestMode) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: 220,
        backgroundColor: BG,
        borderTopWidth: 1,
        borderTopColor: AMBER,
      }}
      pointerEvents="box-none"
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(245,158,11,0.3)',
        }}
      >
        <View
          style={{
            backgroundColor: 'rgba(245,158,11,0.18)',
            borderRadius: 4,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderWidth: 1,
            borderColor: AMBER,
          }}
        >
          <Text
            style={{
              fontFamily: MONO_FONT,
              fontSize: 10,
              color: AMBER,
              fontWeight: '700',
              letterSpacing: 1,
            }}
          >
            ⚡ TEST MODE
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            console.log('[DebugPanel] Clear button pressed');
            clearDebug();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={{
              fontFamily: MONO_FONT,
              fontSize: 10,
              color: 'rgba(245,158,11,0.7)',
            }}
          >
            ✕ Clear
          </Text>
        </TouchableOpacity>
      </View>

      {/* Log entries */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {debugEntries.length === 0 ? (
          <Text
            style={{
              fontFamily: MONO_FONT,
              fontSize: 10,
              color: 'rgba(245,158,11,0.4)',
              fontStyle: 'italic',
            }}
          >
            No entries yet…
          </Text>
        ) : (
          debugEntries.map((entry, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 10,
                  color: 'rgba(245,158,11,0.5)',
                  marginRight: 5,
                }}
              >
                {entry.time}
              </Text>
              <Text
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 10,
                  color: AMBER,
                  fontWeight: '700',
                  marginRight: 5,
                }}
              >
                {entry.label}
              </Text>
              <Text
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 10,
                  color: '#E5E7EB',
                  flexShrink: 1,
                }}
              >
                {entry.value}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
