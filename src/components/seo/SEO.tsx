import React from "react";
import { Helmet } from "react-helmet-async";

type SEOProps = {
  title: string;
  description?: string;
  canonicalPath?: string;      // e.g. "/video/123"
  image?: string;              // absolute URL to OG image
  noindex?: boolean;
  jsonLd?: object;             // structured data
};

const siteUrl = "https://splikz.com"; // 🔁 put your production domain here
const defaultImage = `${siteUrl}/og-default.jpg`; // put a real image in /public

export default function SEO({
  title,
  description = "Splikz — 3-second videos. Create, share, and explore lightning-fast gestures.",
  canonicalPath = "/",
  image = defaultImage,
  noindex,
  jsonLd,
}: SEOProps) {
  const canonical = `${siteUrl}${canonicalPath}`;
  const twitterImage = image;
  const ogImage = image;

  return (
    <Helmet>
      <title>{title}</title>
      <link rel="canonical" href={canonical} />

      {/* Basic */}
      <meta name="description" content={description} />
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : (
        <>
          <meta name="robots" content="index,follow,max-image-preview:large" />
          <meta name="googlebot" content="index,follow,max-image-preview:large" />
        </>
      )}
      <meta name="theme-color" content="#0ea5e9" />

      {/* Open Graph */}
      <meta property="og:site_name" content="Splikz" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content="Splikz preview image" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={twitterImage} />

      {/* Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
