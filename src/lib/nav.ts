import { ChatIcon, ProfileIcon, SettingsIcon } from "../icons";

export interface NavTab {
  href: string;
  label: string;
  icon: (p: { size?: number; class?: string }) => import("solid-js").JSX.Element;
  match: (pathname: string) => boolean;
}

export const NAV_TABS: NavTab[] = [
  { href: "/", label: "Chats", icon: ChatIcon, match: (p) => p === "/" || p.startsWith("/chat") },
  { href: "/settings", label: "Settings", icon: SettingsIcon, match: (p) => p.startsWith("/settings") },
  { href: "/profile", label: "Profile", icon: ProfileIcon, match: (p) => p.startsWith("/profile") },
];
