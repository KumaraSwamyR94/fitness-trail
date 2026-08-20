import { act, render } from '@testing-library/react-native';
import React from 'react';
import { Keyboard, type KeyboardEvent, Text } from 'react-native';

import { SheetScaffold } from '@/components/sheet-scaffold';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('SheetScaffold keyboard layout', () => {
  const originalExpoOs = process.env.EXPO_OS;

  afterEach(() => {
    process.env.EXPO_OS = originalExpoOs;
    jest.restoreAllMocks();
  });

  test('uses native scroll insets and hides the fixed footer for the iOS keyboard', async () => {
    process.env.EXPO_OS = 'ios';
    const listeners: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      listeners[event] = () => listener({} as KeyboardEvent);
      return { remove: jest.fn() } as never;
    });

    const view = await render(
      <SheetScaffold footer={<Text>Save exercise</Text>}>
        <Text>Form content</Text>
      </SheetScaffold>,
    );

    expect(view.getByText('Save exercise')).toBeTruthy();

    await act(() => listeners.keyboardWillShow());
    expect(view.queryByText('Save exercise')).toBeNull();

    await act(() => listeners.keyboardWillHide());
    expect(view.getByText('Save exercise')).toBeTruthy();
  });
});
