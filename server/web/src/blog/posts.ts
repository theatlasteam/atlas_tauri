import type { TranslationKey } from "../lib/i18n";

/** The blog is data, not routes: add a slug here (plus a screen and i18n
 *  keys) and it appears in the index with zero plumbing. */
export interface BlogPostMeta {
  slug: string;
  dateKey: TranslationKey;
  tagKey: TranslationKey;
  titleKey: TranslationKey;
  excerptKey: TranslationKey;
  minutes: number;
  /** Cover art in web/public, shown on the card and the post hero. */
  image: string;
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
  },
];

export function findPost(slug: string): BlogPostMeta | undefined {
  return POSTS.find((p) => p.slug === slug);
}
