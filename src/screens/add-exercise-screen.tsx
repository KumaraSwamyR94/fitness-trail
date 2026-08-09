import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon, type AppIconProps } from '@/components/app-icon';
import { FormField } from '@/components/form-field';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { muscleGroupRepository } from '@/data/muscle-group-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import type { ExerciseCatalogEntry, ExerciseType, MuscleGroupCatalogEntry } from '@/types/workout';
import { successFeedback } from '@/utils/feedback';
import { normalizeName, validateName } from '@/utils/names';
import { track } from '@/utils/telemetry';
import { EXERCISE_TYPE_OPTIONS, exerciseTypeLabel } from '@/utils/workout';

const exerciseTypeIcons: Record<ExerciseType, AppIconProps['name']> = {
  free_weight: 'dumbbell',
  machine: 'cog-outline',
  body_weight: 'arm-flex-outline',
  cardio: 'run-fast',
};

export default function AddExerciseScreen(): React.ReactElement {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { notifyDataChanged } = useDataChange();
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<ExerciseCatalogEntry[]>([]);
  const [muscleGroupQuery, setMuscleGroupQuery] = React.useState('');
  const [exerciseType, setExerciseType] = React.useState<ExerciseType>('free_weight');
  const [muscleGroupSuggestions, setMuscleGroupSuggestions] = React.useState<
    MuscleGroupCatalogEntry[]
  >([]);
  const [exerciseError, setExerciseError] = React.useState<string | null>(null);
  const [muscleGroupError, setMuscleGroupError] = React.useState<string | null>(null);
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

  React.useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      void muscleGroupRepository.searchCatalog(db, muscleGroupQuery).then((rows) => {
        if (active) setMuscleGroupSuggestions(rows);
      });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [db, muscleGroupQuery]);

  const exactMatch = suggestions.find((item) => item.normalizedName === normalizeName(query));
  const exactMuscleGroup = muscleGroupSuggestions.find(
    (item) => item.normalizedName === normalizeName(muscleGroupQuery),
  );

  const add = async (name: string, muscleGroupName: string, type: ExerciseType) => {
    const exerciseValidation = validateName(name);
    const muscleGroupValidation = type === 'cardio' && !muscleGroupName.trim()
      ? null
      : validateName(muscleGroupName);
    setExerciseError(exerciseValidation);
    setMuscleGroupError(
      muscleGroupValidation === 'Enter a name.'
        ? 'Choose or enter a muscle group.'
        : muscleGroupValidation,
    );
    if (exerciseValidation || muscleGroupValidation) {
      return;
    }
    setSaving(true);
    setExerciseError(null);
    setMuscleGroupError(null);
    try {
      const exercise = await exerciseRepository.create(db, sessionId, name, muscleGroupName, type);
      notifyDataChanged();
      track('exercise_created', {
        exerciseId: exercise.id,
        muscleGroupId: exercise.muscleGroupId,
        exerciseType: exercise.exerciseType,
      });
      successFeedback();
      router.back();
    } catch (caught) {
      setExerciseError(caught instanceof Error ? caught.message : 'Unable to add exercise.');
    } finally {
      setSaving(false);
    }
  };

  const addCurrentExercise = () => {
    void add(
      exactMatch?.displayName ?? query,
      exactMuscleGroup?.displayName ?? muscleGroupQuery,
      exerciseType,
    );
  };

  const selectExercise = (item: ExerciseCatalogEntry) => {
    setQuery(item.displayName);
    setMuscleGroupQuery(item.muscleGroupName ?? '');
    setExerciseType(item.exerciseType);
    setExerciseError(null);
    setMuscleGroupError(null);
  };

  return (
    <SheetScaffold
      footer={
        <AppButton
          label={exactMatch ? `Add ${exactMatch.displayName}` : 'Create New Exercise'}
          onPress={addCurrentExercise}
          loading={saving}
          disabled={!query.trim() || (exerciseType !== 'cardio' && !muscleGroupQuery.trim())}
          testID="create-exercise"
        />
      }
    >
      <Text selectable style={{ color: theme.colors.textMuted, lineHeight: 21 }}>
        Search your exercise history or create a reusable exercise with the right training type.
      </Text>
      <FormField
        label="Exercise name"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setExerciseError(null);
        }}
        placeholder="e.g. Barbell Bench Press"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => {
          if (query.trim() && (exerciseType === 'cardio' || muscleGroupQuery.trim())) addCurrentExercise();
          else if (exerciseType !== 'cardio' && !muscleGroupQuery.trim()) setMuscleGroupError('Choose or enter a muscle group.');
        }}
        maxLength={80}
        error={exerciseError}
        testID="exercise-name"
      />
      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>Exercise type</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EXERCISE_TYPE_OPTIONS.map((option) => {
            const selected = option.value === exerciseType;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                testID={`exercise-type-${option.value}`}
                onPress={() => { setExerciseType(option.value); setMuscleGroupError(null); }}
                style={({ pressed }) => ({
                  width: '48%', minHeight: 46, flexGrow: 1, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 12, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.accentSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <AppIcon
                    name={exerciseTypeIcons[option.value]}
                    color={selected ? theme.colors.accent : theme.colors.textMuted}
                    size={21}
                  />
                  <Text selectable style={{ color: selected ? theme.colors.accent : theme.colors.text, fontWeight: '700' }}>
                    {option.label}
                  </Text>
                  {selected ? <AppIcon name="check-circle" color={theme.colors.accent} size={16} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <FormField
          label={`Muscle Group${exerciseType === 'cardio' ? ' — optional' : ''}`}
          value={muscleGroupQuery}
          onChangeText={(value) => {
            setMuscleGroupQuery(value);
            setMuscleGroupError(null);
          }}
          placeholder="e.g. Chest"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (query.trim() && (exerciseType === 'cardio' || muscleGroupQuery.trim())) addCurrentExercise();
          }}
          maxLength={80}
          error={muscleGroupError}
          testID="muscle-group"
        />
        <Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>
          {muscleGroupQuery.trim() ? 'Matching muscle groups' : 'Major muscle groups'}
        </Text>
        {muscleGroupSuggestions.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {muscleGroupSuggestions.map((item) => {
              const selected = item.normalizedName === normalizeName(muscleGroupQuery);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.displayName}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setMuscleGroupQuery(item.displayName);
                    setMuscleGroupError(null);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 42,
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected
                      ? theme.colors.accentSoft
                      : pressed
                        ? theme.colors.surfaceMuted
                        : theme.colors.surface,
                  })}
                >
                  <Text
                    selectable
                    style={{
                      color: selected ? theme.colors.accent : theme.colors.text,
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    {selected ? '✓ ' : ''}{item.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text selectable style={{ color: theme.colors.textMuted }}>
            No matching muscle group yet.
          </Text>
        )}
        {muscleGroupQuery.trim() && !exactMuscleGroup ? (
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            “{muscleGroupQuery.trim()}” will be saved as a reusable muscle group.
          </Text>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>
          {query.trim() ? 'Exercise suggestions' : 'Recently used exercises'}
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
              accessibilityLabel={`Select ${item.displayName}${item.muscleGroupName ? `, ${item.muscleGroupName}` : ''}`}
              onPress={() => selectExercise(item)}
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
              {item.muscleGroupName ? (
                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, paddingTop: 3 }}>
                  {item.muscleGroupName}
                </Text>
              ) : null}
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, paddingTop: 3 }}>
                {exerciseTypeLabel(item.exerciseType)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </SheetScaffold>
  );
}
