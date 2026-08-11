import { Helmet } from "react-helmet-async";
import { SITE_URL } from "../../utils/constants";

/** Props for {@link SeoHead}. `title` is suffixed with the brand; `jsonLd` accepts one or many schema.org objects. */
interface ISeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  keywords?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Injects per-page `<head>` metadata via react-helmet-async: title, description,
 * canonical URL, Open Graph and Twitter card tags, and optional JSON-LD
 * structured data. Build the `jsonLd` objects with the helpers in utils/structuredData.
 */
export function SeoHead({
  title,
  description,
  canonicalPath,
  ogImage,
  keywords,
  jsonLd,
}: ISeoHeadProps) {
  const fullTitle = `${title} | Bee Epic Apiary`;
  const url = canonicalPath ? `${SITE_URL}${canonicalPath}` : SITE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Bee Epic Apiary" />
      {ogImage && <meta property="og:image" content={ogImage} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
