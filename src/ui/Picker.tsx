import { Combobox } from "@atlas/ui";

export interface PickerOption {
  value: string;
  label: string;
}

/** Keep settings pickers on the shared custom menu, not an OS-native select. */
export default function Picker(props: {
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
}) {
  return (
    <Combobox
      class="w-40 max-w-full"
      value={props.value}
      onChange={props.onChange}
      options={props.options}
    />
  );
}
