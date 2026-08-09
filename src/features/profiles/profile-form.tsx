import DateTimePicker from '@react-native-community/datetimepicker';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon, type AppIconProps } from '@/components/app-icon';
import { FormField } from '@/components/form-field';
import { ProfileAvatar } from '@/components/profile-avatar';
import { SheetScaffold } from '@/components/sheet-scaffold';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsiveLayout } from '@/theme/use-responsive-layout';
import type { Gender, HeightUnit } from '@/types/bmi';
import type { ProfileAgeSource, ProfileInput, ProfilePhoto, ProfileValidationErrors } from '@/types/profile';
import {
  centimetersToFeetInches,
  feetInchesToCentimeters,
  GENDER_LABELS,
} from '@/utils/bmi';
import {
  cacheMissingAvatars,
  cachedAvatarSnapshot,
  persistProfilePhoto,
  removePrivateProfilePhoto,
  type CachedAvatar,
} from '@/utils/profile-media';
import { fromBirthDateKey, toBirthDateKey, validateProfileInput } from '@/utils/profiles';

interface ProfileFormProps {
  initialValue?: ProfileInput;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: ProfileInput) => Promise<void>;
}

const GENDERS = Object.keys(GENDER_LABELS) as Gender[];

function editableNumber(value: number, decimals = 2): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : '';
}

function parseNumber(value: string): number {
  return value.trim() ? Number(value) : Number.NaN;
}

function SourceAction({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: AppIconProps['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}): React.ReactElement {
  const theme = useAppTheme();
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 92,
        minHeight: 68,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: danger ? theme.colors.danger : theme.colors.border,
        backgroundColor: danger ? theme.colors.dangerSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 10,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <AppIcon name={icon} color={color} size={22} />
      <Text selectable style={{ color, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function AvatarGallery({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const theme = useAppTheme();
  const [avatars, setAvatars] = React.useState<CachedAvatar[]>(cachedAvatarSnapshot);
  const [loading, setLoading] = React.useState(() => cachedAvatarSnapshot().some((avatar) => !avatar.uri));

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await cacheMissingAvatars(setAvatars);
    setAvatars(result);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let active = true;
    void cacheMissingAvatars((value) => { if (active) setAvatars(value); }).then((value) => {
      if (!active) return;
      setAvatars(value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const failed = avatars.some((avatar) => avatar.error);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Choose an avatar</Text>
          <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13 }}>Downloaded once and kept on this device.</Text>
        </View>
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {avatars.map((avatar) => {
          const checked = selected === avatar.id;
          return (
            <Pressable
              key={avatar.id}
              accessibilityRole="radio"
              accessibilityState={{ checked, disabled: !avatar.uri }}
              accessibilityLabel={`Avatar ${avatar.id.replace('trail-', '')}`}
              disabled={!avatar.uri}
              onPress={() => onSelect(avatar.id)}
              testID={`profile-avatar-${avatar.id}`}
              style={({ pressed }) => ({
                width: '21.5%',
                aspectRatio: 1,
                flexGrow: 1,
                maxWidth: 88,
                borderRadius: 18,
                borderCurve: 'continuous',
                borderWidth: checked ? 3 : 1,
                borderColor: checked ? theme.colors.accent : theme.colors.border,
                overflow: 'hidden',
                backgroundColor: theme.colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.72 : avatar.uri ? 1 : 0.55,
              })}
            >
              {avatar.uri ? (
                <Image source={{ uri: avatar.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
              ) : avatar.error ? (
                <AppIcon name="wifi-off" color={theme.colors.textMuted} size={20} />
              ) : (
                <ActivityIndicator color={theme.colors.accent} size="small" />
              )}
              {checked ? (
                <View style={{ position: 'absolute', right: 5, bottom: 5, borderRadius: 99, backgroundColor: theme.colors.accent }}>
                  <AppIcon name="check" color="#FFFFFF" size={16} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {failed && !loading ? (
        <AppButton label="Retry Avatar Download" variant="secondary" icon={{ name: 'refresh' }} onPress={() => void load()} />
      ) : null}
    </View>
  );
}

function BirthDateField({
  value,
  onChange,
  error,
}: {
  value: Date;
  onChange: (date: Date) => void;
  error?: string;
}): React.ReactElement {
  const theme = useAppTheme();
  const [open, setOpen] = React.useState(false);
  const label = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(value);
  const picker = (
    <DateTimePicker
      value={value}
      mode="date"
      maximumDate={new Date()}
      display={process.env.EXPO_OS === 'ios' ? 'compact' : 'default'}
      onValueChange={(_, date) => {
        if (process.env.EXPO_OS !== 'ios') setOpen(false);
        onChange(date);
      }}
      onDismiss={() => setOpen(false)}
    />
  );
  return (
    <View style={{ gap: 7 }}>
      <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Date of birth</Text>
      {process.env.EXPO_OS === 'ios' ? (
        <View style={{ minHeight: 50, justifyContent: 'center', borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: error ? theme.colors.danger : theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 12 }}>
          {picker}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose date of birth"
          onPress={() => setOpen(true)}
          style={{ minHeight: 50, justifyContent: 'center', borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: error ? theme.colors.danger : theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 14 }}
        >
          <Text selectable style={{ color: theme.colors.text, fontSize: 16 }}>{label}</Text>
        </Pressable>
      )}
      {open && process.env.EXPO_OS !== 'ios' ? picker : null}
      {error ? <Text selectable style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function ProfileForm({ initialValue, submitLabel, submitting, onSubmit }: ProfileFormProps): React.ReactElement {
  const theme = useAppTheme();
  const { compact } = useResponsiveLayout();
  const [name, setName] = React.useState(initialValue?.name ?? '');
  const [ageSource, setAgeSource] = React.useState<ProfileAgeSource>(initialValue?.ageSource ?? 'age');
  const [age, setAge] = React.useState(initialValue?.ageYears ? String(initialValue.ageYears) : '');
  const defaultDob = React.useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 30);
    return date;
  }, []);
  const [dateOfBirth, setDateOfBirth] = React.useState(
    () => initialValue?.dateOfBirth ? fromBirthDateKey(initialValue.dateOfBirth) ?? defaultDob : defaultDob,
  );
  const [gender, setGender] = React.useState<Gender | null>(initialValue?.gender ?? null);
  const [heightUnit, setHeightUnit] = React.useState<HeightUnit>(initialValue?.inputHeightUnit ?? 'cm');
  const [heightCm, setHeightCm] = React.useState(initialValue ? editableNumber(initialValue.heightCm) : '');
  const imperial = centimetersToFeetInches(initialValue?.heightCm ?? 0);
  const [heightFeet, setHeightFeet] = React.useState(initialValue ? String(imperial.feet) : '');
  const [heightInches, setHeightInches] = React.useState(initialValue ? editableNumber(imperial.inches) : '');
  const [photo, setPhoto] = React.useState<ProfilePhoto>(initialValue?.photo ?? { kind: 'none', ref: null });
  const [showAvatars, setShowAvatars] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<ProfileValidationErrors>({});

  const clearErrors = () => setErrors({});
  const parsedHeight = heightUnit === 'cm'
    ? parseNumber(heightCm)
    : feetInchesToCentimeters(parseNumber(heightFeet), parseNumber(heightInches));

  const replacePhoto = async (next: ProfilePhoto) => {
    if (photo.kind === 'local' && photo.ref !== initialValue?.photo.ref) removePrivateProfilePhoto(photo);
    setPhoto(next);
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    let imagePicker: typeof import('expo-image-picker');
    try {
      imagePicker = await import('expo-image-picker');
    } catch {
      Alert.alert(
        'App update required',
        'Camera and photo-library support is not included in this installed app build. Rebuild or reinstall the app, or choose one of the included avatars for now.',
      );
      return;
    }

    try {
      const permission = source === 'camera'
        ? await imagePicker.requestCameraPermissionsAsync()
        : await imagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? 'Camera access is off' : 'Photo access is off',
          `Allow access in system settings to choose a profile picture. You can still save without one.`,
        );
        return;
      }
      setPhotoBusy(true);
      const result = source === 'camera'
        ? await imagePicker.launchCameraAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await imagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) await replacePhoto(await persistProfilePhoto(result.assets[0].uri));
    } catch (error) {
      Alert.alert('Picture could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const changeHeightUnit = (unit: HeightUnit) => {
    if (unit === heightUnit) return;
    if (unit === 'ft-in') {
      const converted = centimetersToFeetInches(parseNumber(heightCm));
      if (converted.feet > 0) {
        setHeightFeet(String(converted.feet));
        setHeightInches(editableNumber(converted.inches));
      }
    } else {
      const converted = feetInchesToCentimeters(parseNumber(heightFeet), parseNumber(heightInches));
      if (Number.isFinite(converted)) setHeightCm(editableNumber(converted));
    }
    setHeightUnit(unit);
    clearErrors();
  };

  const save = async () => {
    const input: ProfileInput = {
      name,
      ageSource,
      ageYears: ageSource === 'age' ? parseNumber(age) : null,
      dateOfBirth: ageSource === 'dob' ? toBirthDateKey(dateOfBirth) : null,
      gender: gender ?? 'prefer_not_to_say',
      inputHeightUnit: heightUnit,
      heightCm: parsedHeight,
      photo,
    };
    const nextErrors = validateProfileInput(input);
    if (!gender) nextErrors.gender = 'Choose a gender option.';
    if (heightUnit === 'ft-in' && !Number.isFinite(parsedHeight)) nextErrors.height = 'Use whole feet and inches from 0 up to 11.99.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSubmit(input);
  };

  return (
    <SheetScaffold
      testID="profile-form"
      footer={<AppButton label={submitLabel} loading={submitting} onPress={() => void save()} testID="save-profile" />}
    >
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ opacity: photoBusy ? 0.55 : 1 }}><ProfileAvatar name={name || 'Profile'} photo={photo} size={104} /></View>
        {photoBusy ? <ActivityIndicator color={theme.colors.accent} /> : null}
        <Text selectable style={{ color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
          Add a picture or keep the initials placeholder.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        <SourceAction icon="camera" label="Camera" onPress={() => void pickPhoto('camera')} />
        <SourceAction icon="image-outline" label="Photo Library" onPress={() => void pickPhoto('library')} />
        <SourceAction icon="account-multiple-outline" label="Avatars" onPress={() => setShowAvatars((value) => !value)} />
        {photo.kind !== 'none' ? <SourceAction icon="close" label="Remove" danger onPress={() => void replacePhoto({ kind: 'none', ref: null })} /> : null}
      </View>

      {showAvatars ? (
        <AvatarGallery
          selected={photo.kind === 'avatar' ? photo.ref : null}
          onSelect={(id) => void replacePhoto({ kind: 'avatar', ref: id })}
        />
      ) : null}

      <FormField label="Name" value={name} onChangeText={(value) => { setName(value); clearErrors(); }} maxLength={80} returnKeyType="next" error={errors.name} testID="profile-name" />

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Age information</Text>
        <SegmentedControl
          accessibilityLabel="Age information"
          values={['Age', 'Date of birth']}
          selectedIndex={ageSource === 'age' ? 0 : 1}
          onChange={(event) => { setAgeSource(event.nativeEvent.selectedSegmentIndex === 0 ? 'age' : 'dob'); clearErrors(); }}
          style={{ height: 44 }}
        />
      </View>
      {ageSource === 'age' ? (
        <FormField label="Age" value={age} onChangeText={(value) => { setAge(value); clearErrors(); }} keyboardType="number-pad" inputMode="numeric" error={errors.age} testID="profile-age" />
      ) : (
        <BirthDateField value={dateOfBirth} onChange={(value) => { setDateOfBirth(value); clearErrors(); }} error={errors.dateOfBirth} />
      )}

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Gender</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GENDERS.map((option) => {
            const checked = gender === option;
            return (
              <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={GENDER_LABELS[option]} onPress={() => { setGender(option); clearErrors(); }} testID={`profile-gender-${option}`} style={({ pressed }) => ({ minHeight: 42, justifyContent: 'center', borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: checked ? theme.colors.accent : theme.colors.border, backgroundColor: checked ? theme.colors.accentSoft : theme.colors.surface, paddingHorizontal: 13, opacity: pressed ? 0.78 : 1 })}>
                <Text selectable style={{ color: checked ? theme.colors.accent : theme.colors.text, fontWeight: '700' }}>{GENDER_LABELS[option]}</Text>
              </Pressable>
            );
          })}
        </View>
        {errors.gender ? <Text selectable style={{ color: theme.colors.danger, fontSize: 13 }}>{errors.gender}</Text> : null}
      </View>

      <View style={{ gap: 9 }}>
        <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>Height unit</Text>
        <SegmentedControl accessibilityLabel="Height unit" values={['Centimetres', 'Feet & inches']} selectedIndex={heightUnit === 'cm' ? 0 : 1} onChange={(event) => changeHeightUnit(event.nativeEvent.selectedSegmentIndex === 0 ? 'cm' : 'ft-in')} style={{ height: 44 }} />
      </View>
      {heightUnit === 'cm' ? (
        <FormField label="Height (cm)" value={heightCm} onChangeText={(value) => { setHeightCm(value); clearErrors(); }} keyboardType="decimal-pad" inputMode="decimal" error={errors.height} testID="profile-height-cm" />
      ) : (
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><FormField label="Height (feet)" value={heightFeet} onChangeText={(value) => { setHeightFeet(value); clearErrors(); }} keyboardType="number-pad" inputMode="numeric" testID="profile-height-feet" /></View>
            <View style={{ flex: 1 }}><FormField label="Height (inches)" value={heightInches} onChangeText={(value) => { setHeightInches(value); clearErrors(); }} keyboardType="decimal-pad" inputMode="decimal" testID="profile-height-inches" /></View>
          </View>
          {errors.height ? <Text selectable style={{ color: theme.colors.danger, fontSize: 13 }}>{errors.height}</Text> : null}
        </View>
      )}

      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        Fitness Trail uses adult BMI categories. Profile details are copied into each new measurement and older history stays unchanged.
      </Text>
    </SheetScaffold>
  );
}
