import type { TranslationKey } from "./i18n";
import type { NavIconName } from "../components/AnimatedNavIcon";

export interface NavTab {
  href: string;
  labelKey: TranslationKey;
  iconName: NavIconName;
  match: (pathname: string) => boolean;
}

export const NAV_TABS: NavTab[] = [
  {
    href: "/",
    labelKey: "nav.chats",
    iconName: "chats",
    match: (p) => p === "/" || p.startsWith("/chat"),
  },
  {
    href: "/calls",
    labelKey: "nav.calls",
    iconName: "calls",
    match: (p) => p.startsWith("/calls"),
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    iconName: "settings",
    match: (p) => p.startsWith("/settings"),
  },
  {
    href: "/profile",
    labelKey: "nav.profile",
    iconName: "profile",
    match: (p) => p.startsWith("/profile"),
  },
];
