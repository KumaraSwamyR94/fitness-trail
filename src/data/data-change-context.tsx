import React from 'react';

interface DataChangeValue {
  version: number;
  notifyDataChanged: () => void;
}

const DataChangeContext = React.createContext<DataChangeValue | null>(null);

export function DataChangeProvider({ children }: React.PropsWithChildren): React.ReactElement {
  const [version, setVersion] = React.useState(0);
  const notifyDataChanged = React.useCallback(() => setVersion((value) => value + 1), []);
  const value = React.useMemo(() => ({ version, notifyDataChanged }), [notifyDataChanged, version]);
  return <DataChangeContext value={value}>{children}</DataChangeContext>;
}

export function useDataChange(): DataChangeValue {
  const value = React.use(DataChangeContext);
  if (!value) throw new Error('useDataChange must be used within DataChangeProvider.');
  return value;
}
