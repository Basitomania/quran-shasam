import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuranProvider, useQuranData } from './src/context/QuranContext';
import { BookmarksProvider } from './src/context/BookmarksContext';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { TextSearchScreen } from './src/screens/TextSearchScreen';
import { VoiceSearchScreen } from './src/screens/VoiceSearchScreen';
import { ThematicSearchScreen } from './src/screens/ThematicSearchScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { colors } from './src/theme/colors';
import { testIDs } from './src/testIDs';

const Tab = createBottomTabNavigator();

function AppContent() {
  const { isLoading, loadingMessage, error, retry } = useQuranData();

  if (isLoading || error) {
    return <LoadingScreen message={loadingMessage} error={error} onRetry={retry} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTintColor: colors.accent,
          headerTitleStyle: {
            fontWeight: '600',
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: 4,
            height: 60,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tab.Screen
          name="Text"
          component={TextSearchScreen}
          options={{
            title: 'Text Search',
            headerTitle: 'Quran Shasam',
            tabBarButtonTestID: testIDs.tabs.text,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Voice"
          component={VoiceSearchScreen}
          options={{
            title: 'Voice',
            headerTitle: 'Voice Detection',
            tabBarButtonTestID: testIDs.tabs.voice,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Themes"
          component={ThematicSearchScreen}
          options={{
            title: 'Themes',
            headerTitle: 'Thematic Search',
            tabBarButtonTestID: testIDs.tabs.themes,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="layers-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Saved"
          component={SavedScreen}
          options={{
            title: 'Saved',
            headerTitle: 'Saved Verses',
            tabBarButtonTestID: testIDs.tabs.saved,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'bookmark' : 'bookmark-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QuranProvider>
        <BookmarksProvider>
          <NavigationContainer>
            <AppContent />
          </NavigationContainer>
        </BookmarksProvider>
      </QuranProvider>
    </GestureHandlerRootView>
  );
}
