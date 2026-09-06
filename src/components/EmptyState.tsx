import type { JSX } from "solid-js";
import { EmptyState as UiEmptyState } from "@atlas/ui";

export default function EmptyState(props: {
  icon: (p: { size?: number; class?: string }) => JSX.Element;
  title: string;
  subtitle?: string;
  action?: JSX.Element;
}) {
  return (
    <UiEmptyState
      icon={<props.icon size={26} />}
      title={props.title}
      subtitle={props.subtitle}
      action={props.action}
    />
  );
}
