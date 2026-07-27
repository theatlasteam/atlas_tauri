import { ChatIcon, ProfileIcon, SettingsIcon } from "../icons";
import type { TranslationKey } from "./i18n";

export interface NavTab {
  href: string;
  labelKey: TranslationKey;
  icon: (p: { size?: number; class?: string }) => import("solid-js").JSX.Element;
  match: (pathname: string) => boolean;
}

export const NAV_TABS: NavTab[] = [
  { href: "/", labelKey: "nav.chats", icon: ChatIcon, match: (p) => p === "/" || p.startsWith("/chat") },
  { href: "/settings", labelKey: "nav.settings", icon: SettingsIcon, match: (p) => p.startsWith("/settings") },
  { href: "/profile", labelKey: "nav.profile", icon: ProfileIcon, match: (p) => p.startsWith("/profile") },
];
