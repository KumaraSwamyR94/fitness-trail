import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SetForm } from '@/features/sets/set-form';

jest.mock('expo-image', () => ({ Image: () => null }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderForm(
  exerciseType: 'free_weight' | 'body_weight' | 'cardio',
  onSubmit = jest.fn(async () => undefined),
) {
  return {
    onSubmit,
    ...(await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <SetForm
          exerciseType={exerciseType}
          submitLabel="Save"
          submitting={false}
          onSubmit={onSubmit}
        />
      </SafeAreaProvider>,
    )),
  };
}

describe('category-aware set form', () => {
  test('submits body-weight repetitions without an added load', async () => {
    const { getByTestId, onSubmit, unmount } = await renderForm('body_weight');
    expect(getByTestId('set-weight').props.value).toBe('');
    await fireEvent.changeText(getByTestId('set-reps'), '12');
    await fireEvent.press(getByTestId('save-set'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: 'strength',
        reps: 12,
        inputWeight: null,
        inputUnit: 'kg',
        tutSeconds: 0,
      }),
    );
    await unmount();
  });

  test('converts cardio minute and second fields into canonical seconds', async () => {
    const { getByTestId, onSubmit, queryByTestId, unmount } = await renderForm('cardio');
    expect(queryByTestId('set-reps')).toBeNull();
    await fireEvent.changeText(getByTestId('set-duration-minutes'), '10');
    await fireEvent.changeText(getByTestId('set-duration-seconds'), '30');
    await fireEvent.press(getByTestId('save-set'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ kind: 'duration', durationSeconds: 630 }),
    );
    await unmount();
  });

  test('switches cardio sets to positive whole calorie entry', async () => {
    const { getByLabelText, getByTestId, findByText, onSubmit, unmount } =
      await renderForm('cardio');
    await fireEvent(getByLabelText('Cardio metric'), 'onChange', {
      nativeEvent: { selectedSegmentIndex: 1 },
    });
    await fireEvent.changeText(getByTestId('set-calories'), '0');
    await fireEvent.press(getByTestId('save-set'));
    expect(await findByText('Enter whole calories of 1 or more.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(getByTestId('set-calories'), '120');
    await fireEvent.press(getByTestId('save-set'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ kind: 'calories', calories: 120 }));
    await unmount();
  });
});
