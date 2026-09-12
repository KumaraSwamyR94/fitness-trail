import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { DateTimeField } from '@/components/date-time-field';
import { useDataChange } from '@/data/data-change-context';
import { useProfiles } from '@/data/profile-context';
import {
  BMI_CSV_COLUMNS,
  BMI_SAMPLE_ROW,
  WORKOUT_CSV_COLUMNS,
  WORKOUT_SAMPLE_ROW,
} from '@/features/data-transfer/csv';
import {
  dataTransferService,
  type ImportPreview,
  type ImportResult,
  type TransferDataset,
  TransferFileError,
} from '@/features/data-transfer/data-transfer-service';
import type { TransferCounts, TransferFormat } from '@/features/data-transfer/types';
import { useAppTheme } from '@/theme/use-app-theme';
import { readableContentMaxWidth, useResponsiveLayout } from '@/theme/use-responsive-layout';
import { toLocalDateKey } from '@/utils/dates';
import { successFeedback, warningFeedback } from '@/utils/feedback';
import { track } from '@/utils/telemetry';

function SectionCard({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title: string; subtitle?: string }>): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View
      style={{
        borderRadius: 22,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}): React.ReactElement {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        borderCurve: 'continuous',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceMuted,
        paddingHorizontal: 13,
        paddingVertical: 10,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <AppIcon
        name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
        color={selected ? theme.colors.accent : theme.colors.textMuted}
      />
      <Text
        selectable
        style={{ flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View
      style={{
        minWidth: 92,
        flex: 1,
        borderRadius: 13,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.surfaceMuted,
        padding: 11,
        gap: 2,
      }}
    >
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' }}>
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: '900',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ImportSummary({ preview }: { preview: ImportPreview }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View testID="import-preview" style={{ gap: 12 }}>
      <View
        style={{
          borderRadius: 15,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.surfaceMuted,
          padding: 13,
          gap: 5,
        }}
      >
        <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
          {preview.fileName}
        </Text>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
          {preview.format.toUpperCase()} · {preview.datasets.join(' + ')}
          {preview.dateCoverage
            ? ` · ${preview.dateCoverage.start} to ${preview.dateCoverage.end}`
            : ' · No dated records'}
        </Text>
        {preview.profiles.map((profile) => (
          <Text key={profile.id} selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {profile.name}: {profile.action}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Stat label="ADD" value={preview.counts.additions} />
        <Stat label="UPDATE" value={preview.counts.updates} />
        <Stat label="UNCHANGED" value={preview.counts.unchanged} />
        <Stat label="CONFLICT" value={preview.counts.conflicts} />
        <Stat label="INVALID" value={preview.counts.invalid} />
      </View>
      {preview.datasets.map((dataset) => {
        const value = preview.datasetCounts[dataset];
        return (
          <Text key={dataset} selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {dataset === 'workouts' ? 'Workouts' : 'BMI'}: {value.additions} additions,{' '}
            {value.updates} updates, {value.unchanged} unchanged, {value.conflicts} conflicts,{' '}
            {value.invalid} invalid
          </Text>
        );
      })}
      {preview.issues.length ? (
        <View style={{ gap: 5 }}>
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Review notices
          </Text>
          {preview.issues.slice(0, 10).map((issue, index) => (
            <Text
              key={`${issue.message}-${index}`}
              selectable
              style={{
                color: issue.severity === 'error' ? theme.colors.danger : theme.colors.textMuted,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {issue.file ? `${issue.file}${issue.row ? `, row ${issue.row}` : ''}: ` : ''}
              {issue.message}
            </Text>
          ))}
          {preview.issues.length > 10 ? (
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              {preview.issues.length - 10} more notices are not shown.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ResultSummary({ result }: { result: ImportResult }): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: 15,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.accentSoft,
        padding: 13,
        gap: 4,
      }}
    >
      <Text selectable style={{ color: theme.colors.accent, fontSize: 16, fontWeight: '900' }}>
        Import complete
      </Text>
      <Text selectable style={{ color: theme.colors.text, fontSize: 13, lineHeight: 19 }}>
        {result.additions} added, {result.updates} updated, {result.unchanged} unchanged,{' '}
        {result.conflicts} conflicts skipped, and {result.invalid} invalid rows skipped.
      </Text>
    </View>
  );
}

export default function DataSyncScreen(): React.ReactElement {
  const db = useSQLiteContext();
  const theme = useAppTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const { profiles, selectedProfile, refreshProfiles } = useProfiles();
  const { notifyDataChanged } = useDataChange();
  const [profileIds, setProfileIds] = React.useState<string[] | null>(null);
  const [datasets, setDatasets] = React.useState<TransferDataset[]>(['workouts', 'bmi']);
  const [format, setFormat] = React.useState<TransferFormat>('csv-zip');
  const [allTime, setAllTime] = React.useState(true);
  const [startDate, setStartDate] = React.useState(() => {
    const value = new Date();
    value.setDate(value.getDate() - 90);
    return value;
  });
  const [endDate, setEndDate] = React.useState(() => new Date());
  const [countState, setCountState] = React.useState<{
    key: string;
    counts: TransferCounts;
  } | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [csvTargetProfileId, setCsvTargetProfileId] = React.useState<string | null>(null);
  const [templateDataset, setTemplateDataset] = React.useState<TransferDataset>('workouts');
  const [sharingTemplate, setSharingTemplate] = React.useState(false);

  React.useEffect(() => {
    dataTransferService.purgeCache();
  }, []);

  const selectedProfileIds = React.useMemo(() => {
    const initial = profiles.length ? [selectedProfile?.id ?? profiles[0].id] : [];
    return (profileIds ?? initial).filter((id) => profiles.some((profile) => profile.id === id));
  }, [profileIds, profiles, selectedProfile?.id]);
  const targetProfileId =
    csvTargetProfileId && profiles.some((profile) => profile.id === csvTargetProfileId)
      ? csvTargetProfileId
      : (selectedProfile?.id ?? profiles[0]?.id ?? null);
  const dateRange = React.useMemo(
    () => (allTime ? null : { start: toLocalDateKey(startDate), end: toLocalDateKey(endDate) }),
    [allTime, endDate, startDate],
  );
  const exportOptions = React.useMemo(
    () => ({ profileIds: selectedProfileIds, datasets, format, dateRange }),
    [datasets, format, selectedProfileIds, dateRange],
  );
  const countKey = JSON.stringify(exportOptions);
  const counts = countState?.key === countKey ? countState.counts : null;
  const canCount =
    selectedProfileIds.length > 0 &&
    datasets.length > 0 &&
    (!dateRange || dateRange.start <= dateRange.end);

  React.useEffect(() => {
    let active = true;
    if (!canCount) return undefined;
    void dataTransferService
      .countExport(db, exportOptions)
      .then((next) => {
        if (active) setCountState({ key: countKey, counts: next });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canCount, countKey, db, exportOptions]);

  const toggleProfile = (id: string) => {
    setProfileIds(
      selectedProfileIds.includes(id)
        ? selectedProfileIds.filter((value) => value !== id)
        : [...selectedProfileIds, id],
    );
  };

  const toggleDataset = (dataset: TransferDataset) => {
    setDatasets((current) =>
      current.includes(dataset)
        ? current.filter((value) => value !== dataset)
        : [...current, dataset],
    );
  };

  const shareArtifact = async (uri: string, mimeType: string) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is not available on this device.');
      }
      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle: 'Save or share Fitness Trail data',
        UTI:
          mimeType === 'application/zip'
            ? 'public.zip-archive'
            : mimeType === 'application/json'
              ? 'public.json'
              : 'public.comma-separated-values-text',
      });
    } finally {
      dataTransferService.deleteArtifact(uri);
    }
  };

  const exportData = async () => {
    if (!selectedProfileIds.length || !datasets.length) return;
    if (dateRange && dateRange.start > dateRange.end) {
      Alert.alert('Check the date range', 'The start date must not be after the end date.');
      return;
    }
    setExporting(true);
    try {
      const artifact = await dataTransferService.createExport(db, exportOptions);
      await shareArtifact(artifact.uri, artifact.mimeType);
      track('data_export_created', {
        format,
        profileCount: selectedProfileIds.length,
        datasets,
      });
      successFeedback();
    } catch (error) {
      Alert.alert(
        'Export was not completed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  const chooseImport = async () => {
    setResult(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      setImporting(true);
      const next = await dataTransferService.inspectImport(
        db,
        { uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType },
        targetProfileId ?? undefined,
      );
      setPreview(next);
      track('data_import_previewed', { format: next.format, datasets: next.datasets });
    } catch (error) {
      setPreview(null);
      const message = error instanceof Error ? error.message : 'Please choose another file.';
      Alert.alert(
        error instanceof TransferFileError ? 'Import file is not valid' : 'Import preview failed',
        message,
      );
    } finally {
      setImporting(false);
    }
  };

  const applyImport = async () => {
    if (!preview?.canImport) return;
    setImporting(true);
    try {
      const nextResult = await dataTransferService.applyImport(db, preview);
      await refreshProfiles();
      notifyDataChanged();
      setResult(nextResult);
      setPreview(null);
      track('data_import_completed', {
        format: preview.format,
        additions: nextResult.additions,
        updates: nextResult.updates,
      });
      successFeedback();
    } catch (error) {
      warningFeedback();
      track('data_import_failed', { message: String(error) });
      Alert.alert(
        'Nothing was imported',
        error instanceof Error ? error.message : 'The transaction was rolled back.',
      );
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const warning = preview.requiresWarningConfirmation
      ? 'Invalid rows and conflicts shown in the preview will be skipped. Existing data will not be deleted.'
      : 'Existing newer data will be preserved and no local records will be deleted.';
    Alert.alert('Import these changes?', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import Data', onPress: () => void applyImport() },
    ]);
  };

  const shareTemplate = async () => {
    setSharingTemplate(true);
    try {
      const artifact = await dataTransferService.createTemplate(templateDataset);
      await shareArtifact(artifact.uri, artifact.mimeType);
      track('data_template_exported', { dataset: templateDataset });
    } catch (error) {
      Alert.alert(
        'Template was not shared',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSharingTemplate(false);
    }
  };

  const templateColumns = templateDataset === 'workouts' ? WORKOUT_CSV_COLUMNS : BMI_CSV_COLUMNS;
  const sampleRow = templateDataset === 'workouts' ? WORKOUT_SAMPLE_ROW : BMI_SAMPLE_ROW;
  const coreColumns = templateColumns.slice(0, templateDataset === 'workouts' ? 18 : 8);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        width: '100%',
        maxWidth: readableContentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalPadding,
        paddingTop: horizontalPadding,
        paddingBottom: 48,
        gap: 18,
      }}
    >
      <View
        style={{
          borderRadius: 18,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.dangerSoft,
          padding: 14,
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <AppIcon name="shield-alert-outline" color={theme.colors.danger} />
        <Text
          selectable
          style={{ flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 19 }}
        >
          Export files can contain personal health information and are not encrypted. Store and
          share them carefully.
        </Text>
      </View>

      <SectionCard
        title="Export data"
        subtitle="Choose profiles and records, then save or share one portable file."
      >
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Profiles
          </Text>
          {profiles.length ? (
            profiles.map((profile) => (
              <Choice
                key={profile.id}
                label={profile.name}
                selected={selectedProfileIds.includes(profile.id)}
                onPress={() => toggleProfile(profile.id)}
                testID={`export-profile-${profile.id}`}
              />
            ))
          ) : (
            <Text selectable style={{ color: theme.colors.textMuted, lineHeight: 20 }}>
              There are no profiles to export. You can still import a Fitness Trail JSON backup
              below.
            </Text>
          )}
        </View>
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Data
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Choice
                label="Workouts"
                selected={datasets.includes('workouts')}
                onPress={() => toggleDataset('workouts')}
                testID="export-workouts"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Choice
                label="BMI"
                selected={datasets.includes('bmi')}
                onPress={() => toggleDataset('bmi')}
                testID="export-bmi"
              />
            </View>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Date range
          </Text>
          <SegmentedControl
            accessibilityLabel="Export date range"
            values={['All time', 'Custom']}
            selectedIndex={allTime ? 0 : 1}
            onChange={(event) => setAllTime(event.nativeEvent.selectedSegmentIndex === 0)}
            style={{ height: 42 }}
            testID="export-range"
          />
          {!allTime ? (
            <View style={{ gap: 12 }}>
              <DateTimeField
                dateOnly
                label="Start date"
                value={startDate}
                onChange={setStartDate}
                maximumDate={endDate}
              />
              <DateTimeField
                dateOnly
                label="End date"
                value={endDate}
                onChange={setEndDate}
                maximumDate={new Date()}
                error={
                  dateRange && dateRange.start > dateRange.end
                    ? 'End date must be on or after the start date.'
                    : null
                }
              />
            </View>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Format
          </Text>
          <SegmentedControl
            accessibilityLabel="Export format"
            values={['CSV Bundle', 'Fitness Trail JSON']}
            selectedIndex={format === 'csv-zip' ? 0 : 1}
            onChange={(event) =>
              setFormat(
                event.nativeEvent.selectedSegmentIndex === 0 ? 'csv-zip' : 'fitness-trail-json',
              )
            }
            style={{ height: 42 }}
            testID="export-format"
          />
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            {format === 'csv-zip'
              ? 'Best for spreadsheets. Superset progress and reusable templates require JSON.'
              : 'Best for lossless backup and repeated device-to-device sync.'}
          </Text>
        </View>
        {counts ? (
          <View style={{ gap: 8 }}>
            <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
              Selected records
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="SESSIONS" value={counts.sessions} />
              <Stat label="EXERCISES" value={counts.exercises} />
              <Stat label="SETS" value={counts.sets} />
              <Stat label="BMI" value={counts.bmiMeasurements} />
              <Stat label="SUPERSETS" value={counts.supersets} />
              <Stat label="TEMPLATES" value={counts.templates} />
            </View>
          </View>
        ) : null}
        <AppButton
          label="Create and Share Export"
          icon={{ name: 'export-variant' }}
          onPress={() => void exportData()}
          loading={exporting}
          disabled={
            !selectedProfileIds.length ||
            !datasets.length ||
            Boolean(dateRange && dateRange.start > dateRange.end)
          }
          testID="create-data-export"
        />
      </SectionCard>

      <SectionCard
        title="Import and sync"
        subtitle="Inspect every change before anything is written to this device."
      >
        {profiles.length ? (
          <View style={{ gap: 8 }}>
            <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
              Target for a standalone CSV
            </Text>
            <Text
              selectable
              style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}
            >
              JSON and ZIP files carry stable profile identities. A standalone CSV needs an existing
              target.
            </Text>
            {profiles.map((profile) => (
              <Choice
                key={profile.id}
                label={profile.name}
                selected={targetProfileId === profile.id}
                onPress={() => setCsvTargetProfileId(profile.id)}
                testID={`csv-target-${profile.id}`}
              />
            ))}
          </View>
        ) : null}
        <AppButton
          label="Choose Import File"
          variant="secondary"
          icon={{ name: 'file-import-outline' }}
          onPress={() => void chooseImport()}
          loading={importing && !preview}
          testID="choose-import-file"
        />
        {preview ? <ImportSummary preview={preview} /> : null}
        {preview ? (
          <AppButton
            label={preview.canImport ? 'Review and Import' : 'No Importable Changes'}
            onPress={confirmImport}
            loading={importing}
            disabled={!preview.canImport}
            testID="apply-data-import"
          />
        ) : null}
        {result ? <ResultSummary result={result} /> : null}
      </SectionCard>

      <SectionCard
        title="CSV templates"
        subtitle="Preview the accepted columns and sample values, or share a blank ready-to-edit file."
      >
        <SegmentedControl
          accessibilityLabel="CSV template type"
          values={['Workouts', 'BMI']}
          selectedIndex={templateDataset === 'workouts' ? 0 : 1}
          onChange={(event) =>
            setTemplateDataset(event.nativeEvent.selectedSegmentIndex === 0 ? 'workouts' : 'bmi')
          }
          style={{ height: 42 }}
          testID="template-dataset"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8 }}>
          {coreColumns.map((column) => (
            <View
              key={column.key}
              style={{
                width: 150,
                minHeight: 104,
                borderRadius: 13,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.surfaceMuted,
                padding: 11,
                gap: 4,
              }}
            >
              <Text
                selectable
                style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800' }}
              >
                {column.key}
              </Text>
              <Text
                selectable
                style={{
                  color: column.required ? theme.colors.accent : theme.colors.textMuted,
                  fontSize: 11,
                  fontWeight: '800',
                }}
              >
                {column.required ? 'REQUIRED' : 'OPTIONAL'}
              </Text>
              <Text
                selectable
                style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 16 }}
              >
                {column.description}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View
          style={{
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.surfaceMuted,
            padding: 12,
            gap: 6,
          }}
        >
          <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>
            Sample row
          </Text>
          {coreColumns.slice(0, 8).map((column) => (
            <Text
              key={column.key}
              selectable
              style={{
                color: theme.colors.textMuted,
                fontSize: 12,
                fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
              }}
            >
              {column.key}: {sampleRow[column.key] || '(blank)'}
            </Text>
          ))}
        </View>
        <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
          Use UTF-8 CSV. Keep the header names unchanged. Use one row per set, leave set fields
          blank for an exercise without sets, and fill only the fields that match the selected set
          kind.
        </Text>
        <AppButton
          label={`Share ${templateDataset === 'workouts' ? 'Workout' : 'BMI'} Template`}
          variant="secondary"
          icon={{ name: 'file-delimited-outline' }}
          onPress={() => void shareTemplate()}
          loading={sharingTemplate}
          testID="share-csv-template"
        />
      </SectionCard>
    </ScrollView>
  );
}
