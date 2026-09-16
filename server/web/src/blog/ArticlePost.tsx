import BlogIndex from "./BlogIndex";
import EncryptionPost from "./EncryptionPost";
import PluginsPost from "./PluginsPost";
import CapsulesPost from "./CapsulesPost";
import { findPost } from "./posts";

/** Each post renders its own bespoke page — no shared article template. */
export default function ArticlePost(props: { slug: string }) {
  if (props.slug === "encryption") return <EncryptionPost />;
  if (props.slug === "plugins") return <PluginsPost />;
  if (props.slug === "capsules") return <CapsulesPost />;
  if (findPost(props.slug)) return <BlogIndex />;
  return <BlogIndex />;
}
