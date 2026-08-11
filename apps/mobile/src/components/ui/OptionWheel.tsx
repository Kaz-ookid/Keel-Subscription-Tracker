// The app's one modal selector for picking a VALUE from a list: WheelSheet +
// the native wheel over plain {value, label} options. Native action sheets
// stay reserved for VERBS (restore/share/delete…); 2–4 inline choices stay
// Segmented (§9d).

import { Picker as RNPicker } from "@react-native-picker/picker";
import { type ComponentType, type ReactNode } from "react";

import { useTheme } from "../../theme";
import { WheelSheet } from "../WheelSheet";

// @react-native-picker/picker@2.11 doesn't declare `children` under React 19's
// JSX types; alias to a children-accepting component (runtime is unaffected).
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

export interface WheelOption {
  value: string;
  label: string;
}

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: readonly WheelOption[];
  value: string;
  onChange: (value: string) => void;
}

export function OptionWheel({ visible, title, onClose, options, value, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <WheelSheet visible={visible} title={title} onClose={onClose}>
      <Picker selectedValue={value} onValueChange={(v) => onChange(String(v))}>
        {options.map((o) => (
          <Picker.Item key={o.value} label={o.label} value={o.value} color={colors.text} />
        ))}
      </Picker>
    </WheelSheet>
  );
}
