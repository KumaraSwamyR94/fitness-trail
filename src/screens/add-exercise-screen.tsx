import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import type { ExerciseCatalogEntry } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { normalizeName, validateName } from '@/utils/names';
import { track } from '@/utils/telemetry';

export default function AddExerciseScreen(): React.ReactElement {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<ExerciseCatalogEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      void exerciseRepository.searchCatalog(db, query).then((rows) => {
        if (active) setSuggestions(rows);
      });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [db, query]);

  const exactMatch = suggestions.find((item) => item.normalizedName === normalizeName(query));

  const add = async (name: string) => {
    const validation = validateName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const exercise = await exerciseRepository.create(db, sessionId, name);
      notifyDataChanged();
      track('exercise_created', { exerciseId: exercise.id });
      successFeedback();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add exercise.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScaffold
      footer={
        <AppButton
          label={exactMatch ? `Add ${exactMatch.displayName}` : 'Create New Exercise'}
          onPress={() => void add(exactMatch?.displayName ?? query)}
          loading={saving}
          disabled={!query.trim()}
          testID="create-exercise"
        />
      }
    >
      <Text selectable style={{ color: theme.colors.textMuted, lineHeight: 21 }}>
        Search your exercise history or create a reusable new name.
      </Text>
      <FormField
        label="Exercise name"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setError(null);
        }}
        placeholder="e.g. Barbell Bench Press"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => {
          if (query.trim()) void add(exactMatch?.displayName ?? query);
        }}
        maxLength={80}
        error={error}
        testID="exercise-name"
      />
      <View style={{ gap: 8 }}>
        <Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>
          {query.trim() ? 'Suggestions' : 'Recently used'}
        </Text>
        {suggestions.length === 0 ? (
          <Text selectable style={{ color: theme.colors.textMuted }}>
            {query.trim() ? 'No matching exercise yet.' : 'Your exercise history will appear here.'}
          </Text>
        ) : (
          suggestions.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.displayName}`}
              onPress={() => void add(item.displayName)}
              style={({ pressed }) => ({
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 15,
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
              })}
            >
              <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
                {item.displayName}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </SheetScaffold>
  );
}
