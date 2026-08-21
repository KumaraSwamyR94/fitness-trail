import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppIcon, type AppIconProps } from '@/components/app-icon';
import { FormField } from '@/components/form-field';
import { useDataChange } from '@/data/data-change-context';
import { exerciseRepository } from '@/data/exercise-repository';
import { muscleGroupRepository } from '@/data/muscle-group-repository';
import { useProfiles } from '@/data/profile-context';
import { supersetRepository } from '@/data/superset-repository';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import type {
  ExerciseCatalogEntry,
  ExerciseSummary,
  ExerciseType,
  MuscleGroupCatalogEntry,
  SupersetMemberInput,
  SupersetTemplate,
} from '@/types/workout';
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

function exerciseDraft(exercise: ExerciseSummary): SupersetMemberInput {
  return {
    existingExerciseId: exercise.id,
    catalogId: exercise.catalogId,
    displayName: exercise.displayName,
    muscleGroupName: exercise.muscleGroupName ?? '',
    exerciseType: exercise.exerciseType,
  };
}

export default function CreateSupersetScreen(): React.ReactElement {
  const { sessionId, supersetId } = useLocalSearchParams<{
    sessionId: string;
    supersetId?: string;
  }>();
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { horizontalPadding } = useResponsiveLayout();
  const { notifyDataChanged } = useDataChange();
  const { selectedProfile, loading } = useProfiles();
  const [name, setName] = React.useState('');
  const [members, setMembers] = React.useState<SupersetMemberInput[]>([]);
  const [available, setAvailable] = React.useState<ExerciseSummary[]>([]);
  const [templates, setTemplates] = React.useState<SupersetTemplate[]>([]);
  const [sourceTemplateId, setSourceTemplateId] = React.useState<string | null>(null);
  const [saveTemplate, setSaveTemplate] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<ExerciseCatalogEntry[]>([]);
  const [muscleGroup, setMuscleGroup] = React.useState('');
  const [muscleGroupSuggestions, setMuscleGroupSuggestions] = React.useState<
    MuscleGroupCatalogEntry[]
  >([]);
  const [exerciseType, setExerciseType] = React.useState<ExerciseType>('free_weight');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [renamingTemplateId, setRenamingTemplateId] = React.useState<string | null>(null);
  const [templateName, setTemplateName] = React.useState('');
  const initializedEdit = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!selectedProfile) {
      if (!loading) router.replace('/');
      return;
    }
    const [ungrouped, nextTemplates, details] = await Promise.all([
      supersetRepository.listUngroupedForSession(db, selectedProfile.id, sessionId),
      supersetRepository.listTemplates(db, selectedProfile.id),
      supersetId
        ? supersetRepository.getDetails(db, selectedProfile.id, supersetId)
        : Promise.resolve(null),
    ]);
    const currentMembers = details?.members.map((member) => member.exercise) ?? [];
    const availableMap = new Map(
      [...currentMembers, ...ungrouped].map((exercise) => [exercise.id, exercise]),
    );
    setAvailable([...availableMap.values()]);
    setTemplates(nextTemplates);
    if (details && !initializedEdit.current) {
      if (details.membershipLocked) {
        Alert.alert(
          'Members are locked',
          'Superset membership cannot change after sets are logged.',
          [{ text: 'Close', onPress: () => router.back() }],
        );
        return;
      }
      initializedEdit.current = true;
      setName(details.name);
      setMembers(details.members.map((member) => exerciseDraft(member.exercise)));
      setSourceTemplateId(details.templateId);
    }
  }, [db, loading, selectedProfile, sessionId, supersetId]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      void exerciseRepository.searchCatalog(db, query).then((rows) => {
        if (active) setSuggestions(query.trim() ? rows.slice(0, 5) : []);
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
      void muscleGroupRepository.searchCatalog(db, muscleGroup).then((rows) => {
        if (active) setMuscleGroupSuggestions(rows);
      });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [db, muscleGroup]);

  const selectedNames = new Set(members.map((member) => normalizeName(member.displayName)));
  const exactMuscleGroup = muscleGroupSuggestions.find(
    (suggestion) => suggestion.normalizedName === normalizeName(muscleGroup),
  );

  const toggleExisting = (exercise: ExerciseSummary) => {
    setError(null);
    setMembers((current) => {
      const exists = current.some((member) => member.existingExerciseId === exercise.id);
      return exists
        ? current.filter((member) => member.existingExerciseId !== exercise.id)
        : [...current, exerciseDraft(exercise)];
    });
  };

  const selectSuggestion = (suggestion: ExerciseCatalogEntry) => {
    setQuery(suggestion.displayName);
    setMuscleGroup(suggestion.muscleGroupName ?? '');
    setExerciseType(suggestion.exerciseType);
    setError(null);
  };

  const addDraft = () => {
    const validation = validateName(query);
    if (validation) {
      setError(validation);
      return;
    }
    if (exerciseType !== 'cardio' && !muscleGroup.trim()) {
      setError('Choose or enter a muscle group.');
      return;
    }
    if (selectedNames.has(normalizeName(query))) {
      setError('This exercise is already selected.');
      return;
    }
    const exact = suggestions.find(
      (suggestion) => suggestion.normalizedName === normalizeName(query),
    );
    const existing = available.find((exercise) => exercise.normalizedName === normalizeName(query));
    setMembers((current) => [
      ...current,
      existing
        ? exerciseDraft(existing)
        : {
            catalogId: exact?.id ?? null,
            displayName: exact?.displayName ?? query,
            muscleGroupName: exactMuscleGroup?.displayName ?? exact?.muscleGroupName ?? muscleGroup,
            exerciseType: exact?.exerciseType ?? exerciseType,
          },
    ]);
    setQuery('');
    setMuscleGroup('');
    setExerciseType('free_weight');
    setSuggestions([]);
    setError(null);
  };

  const applyTemplate = (template: SupersetTemplate) => {
    const drafts = template.members.map((member) => {
      const existing = available.find(
        (exercise) => exercise.normalizedName === member.normalizedName,
      );
      return existing
        ? exerciseDraft(existing)
        : {
            catalogId: member.catalogId,
            displayName: member.displayName,
            muscleGroupName: member.muscleGroupName ?? '',
            exerciseType: member.exerciseType,
          };
    });
    setName(template.name);
    setMembers(drafts);
    setSourceTemplateId(template.id);
    setSaveTemplate(false);
    setError(null);
  };

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= members.length) return;
    setMembers((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (members.length < 2) {
      setError('Choose at least two exercises.');
      return;
    }
    if (name.trim() && validateName(name)) {
      setError(validateName(name));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!selectedProfile) throw new Error('Choose a profile first.');
      const input = { name, members, saveAsTemplate: saveTemplate, templateId: sourceTemplateId };
      const id =
        supersetId ?? (await supersetRepository.create(db, selectedProfile.id, sessionId, input));
      if (supersetId)
        await supersetRepository.updateMembers(db, selectedProfile.id, supersetId, input);
      notifyDataChanged();
      track(supersetId ? 'superset_updated' : 'superset_created', {
        supersetId: id,
        memberCount: members.length,
      });
      if (saveTemplate)
        track(sourceTemplateId ? 'superset_template_updated' : 'superset_template_created', {
          supersetId: id,
        });
      successFeedback();
      router.replace({
        pathname: '/sessions/[sessionId]/supersets/[supersetId]',
        params: { sessionId, supersetId: id },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create superset.');
    } finally {
      setSaving(false);
    }
  };

  const renameTemplate = async () => {
    if (!selectedProfile || !renamingTemplateId) return;
    try {
      await supersetRepository.renameTemplate(
        db,
        selectedProfile.id,
        renamingTemplateId,
        templateName,
      );
      setRenamingTemplateId(null);
      track('superset_template_updated', { templateId: renamingTemplateId });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename template.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: supersetId ? 'Edit Superset' : 'Create Superset' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: readableContentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingTop: horizontalPadding,
          paddingBottom: 130,
          gap: 20,
        }}
      >
        <Text selectable style={{ color: theme.colors.textMuted, lineHeight: 21 }}>
          Add two or more exercises. Each round will guide you through them in this order.
        </Text>
        <FormField
          label="Superset name — optional"
          value={name}
          onChangeText={setName}
          placeholder="Assigned automatically if blank"
          maxLength={80}
          testID="superset-name"
        />

        {templates.length ? (
          <View style={{ gap: 10 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
              Reusable templates
            </Text>
            {templates.map((template) => (
              <View
                key={template.id}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  gap: 9,
                }}
              >
                {renamingTemplateId === template.id ? (
                  <FormField
                    label="Template name"
                    value={templateName}
                    onChangeText={setTemplateName}
                    onSubmitEditing={() => void renameTemplate()}
                    autoFocus
                  />
                ) : (
                  <>
                    <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
                      {template.name}
                    </Text>
                    <Text selectable style={{ color: theme.colors.textMuted }}>
                      {template.members.map((member) => member.displayName).join(' → ')}
                    </Text>
                  </>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <Pressable onPress={() => applyTemplate(template)}>
                    <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>Use</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (renamingTemplateId === template.id) void renameTemplate();
                      else {
                        setRenamingTemplateId(template.id);
                        setTemplateName(template.name);
                      }
                    }}
                  >
                    <Text style={{ color: theme.colors.accent, fontWeight: '800' }}>
                      {renamingTemplateId === template.id ? 'Save name' : 'Rename'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Delete template?', template.name, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            if (!selectedProfile) return;
                            void supersetRepository
                              .removeTemplate(db, selectedProfile.id, template.id)
                              .then(() => {
                                track('superset_template_deleted', { templateId: template.id });
                                return load();
                              });
                          },
                        },
                      ])
                    }
                  >
                    <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {available.length ? (
          <View style={{ gap: 10 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
              Exercises in this session
            </Text>
            {available.map((exercise) => {
              const selected = members.some((member) => member.existingExerciseId === exercise.id);
              return (
                <Pressable
                  key={exercise.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={exercise.displayName}
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleExisting(exercise)}
                  style={{
                    minHeight: 50,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 13,
                    borderRadius: 14,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                  }}
                >
                  <AppIcon
                    name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    color={selected ? theme.colors.accent : theme.colors.textMuted}
                  />
                  <Text selectable style={{ flex: 1, color: theme.colors.text, fontWeight: '700' }}>
                    {exercise.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
            Add another exercise
          </Text>
          <FormField
            label="Exercise name"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setError(null);
            }}
            placeholder="Search or create"
            testID="superset-exercise-name"
          />
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              onPress={() => selectSuggestion(suggestion)}
              style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.surface }}
            >
              <Text selectable style={{ color: theme.colors.text, fontWeight: '700' }}>
                {suggestion.displayName}
              </Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                {[exerciseTypeLabel(suggestion.exerciseType), suggestion.muscleGroupName]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EXERCISE_TYPE_OPTIONS.map((option) => {
              const selected = option.value === exerciseType;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setExerciseType(option.value)}
                  style={{
                    minHeight: 42,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                  }}
                >
                  <AppIcon
                    name={exerciseTypeIcons[option.value]}
                    color={selected ? theme.colors.accent : theme.colors.textMuted}
                    size={18}
                  />
                  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FormField
            label={`Muscle group${exerciseType === 'cardio' ? ' — optional' : ''}`}
            value={muscleGroup}
            onChangeText={setMuscleGroup}
            placeholder="e.g. Chest"
            testID="superset-muscle-group"
          />
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>
            {muscleGroup.trim() ? 'Matching muscle groups' : 'Major muscle groups'}
          </Text>
          {muscleGroupSuggestions.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {muscleGroupSuggestions.map((suggestion) => {
                const selected = suggestion.normalizedName === normalizeName(muscleGroup);
                return (
                  <Pressable
                    key={suggestion.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${suggestion.displayName}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setMuscleGroup(suggestion.displayName);
                      setError(null);
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
                      {selected ? '✓ ' : ''}
                      {suggestion.displayName}
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
          {muscleGroup.trim() && !exactMuscleGroup ? (
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              “{muscleGroup.trim()}” will be saved as a reusable muscle group.
            </Text>
          ) : null}
          <AppButton
            label="Add to Superset"
            variant="secondary"
            onPress={addDraft}
            disabled={!query.trim()}
            testID="add-superset-member"
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
            Selected exercises ({members.length})
          </Text>
          {members.map((member, index) => (
            <View
              key={`${member.existingExerciseId ?? member.catalogId ?? member.displayName}-${index}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 13,
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text selectable style={{ flex: 1, color: theme.colors.text, fontWeight: '800' }}>
                {index + 1}. {member.displayName}
              </Text>
              <Pressable
                accessibilityLabel={`Move ${member.displayName} up`}
                onPress={() => move(index, -1)}
              >
                <AppIcon name="arrow-up" color={theme.colors.textMuted} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Move ${member.displayName} down`}
                onPress={() => move(index, 1)}
              >
                <AppIcon name="arrow-down" color={theme.colors.textMuted} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Remove ${member.displayName}`}
                onPress={() =>
                  setMembers((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <AppIcon name="close-circle-outline" color={theme.colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>

        <View
          style={{
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
              {sourceTemplateId ? 'Update reusable template' : 'Save as reusable template'}
            </Text>
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              Off keeps this session superset independent.
            </Text>
          </View>
          <Switch value={saveTemplate} onValueChange={setSaveTemplate} />
        </View>
        {error ? (
          <Text selectable style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: horizontalPadding,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 14),
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <View style={{ width: '100%', maxWidth: readableContentMaxWidth, alignSelf: 'center' }}>
          <AppButton
            label={supersetId ? 'Save Superset' : 'Create Superset'}
            onPress={() => void save()}
            loading={saving}
            disabled={members.length < 2}
            testID="create-superset"
          />
        </View>
      </View>
    </View>
  );
}
