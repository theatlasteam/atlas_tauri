import type { TranslationKey } from "../lib/i18n";

/** The blog is data, not routes: add a slug here (plus its own bespoke
 *  screen and i18n keys) and it appears in the index with zero plumbing. */
export interface BlogPostMeta {
  slug: string;
  dateKey: TranslationKey;
  tagKey: TranslationKey;
  titleKey: TranslationKey;
  excerptKey: TranslationKey;
  minutes: number;
  /** Cover art in web/public, shown on the card and the post hero. */
  image: string;
  /** Pinned posts sort first in the index and get a pin badge. */
  pinned?: boolean;
}

export const POSTS: BlogPostMeta[] = [
  {
    slug: "minds",
    dateKey: "blog.minds.date",
    tagKey: "blog.minds.tag",
    titleKey: "blog.minds.title",
    excerptKey: "blog.minds.excerpt",
    minutes: 4,
    image: "/minds.png",
    pinned: true,
  },
  {
    slug: "encryption",
    dateKey: "blog.encryption.date",
    tagKey: "blog.encryption.tag",
    titleKey: "blog.encryption.title",
    excerptKey: "blog.encryption.excerpt",
    minutes: 6,
    image: "/blog-encryption.svg",
  },
  {
    slug: "plugins",
    dateKey: "blog.plugins.date",
    tagKey: "blog.plugins.tag",
    titleKey: "blog.plugins.title",
    excerptKey: "blog.plugins.excerpt",
    minutes: 5,
    image: "/blog-plugins.svg",
  },
  {
    slug: "capsules",
    dateKey: "blog.capsules.date",
    tagKey: "blog.capsules.tag",
    titleKey: "blog.capsules.title",
    excerptKey: "blog.capsules.excerpt",
    minutes: 3,
    image: "/blog-capsules.svg",
  },
];

export function findPost(slug: string): BlogPostMeta | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** Index order: pinned posts first (in declaration order), then the rest. */
export function sortedPosts(): BlogPostMeta[] {
  return [...POSTS].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
}
