import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';

type MaterialDesignIconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

export interface AppIconProps {
  name: MaterialDesignIconName;
  color: string;
  size?: number;
}

export function AppIcon({ name, color, size = 20 }: AppIconProps): React.ReactElement {
  return <MaterialDesignIcons name={name} color={color} size={size} />;
}
