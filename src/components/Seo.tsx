interface SeoProps {
  title?: string;
  description?: string;
  path?: string;
  type?: "website" | "article";
}

// Metadata (title / description / og tags) is intentionally not rendered.
export default function Seo(_props: SeoProps) {
  return null;
}
