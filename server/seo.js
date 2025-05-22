// functions/seo.js
// SEO utility functions for enhanced meta tags and structured data
// Version 1.0

/**
 * Generate comprehensive meta tags for pages
 * @param {Object} options Configuration options
 * @returns {string} HTML string with meta tags
 */
function generateMetaTags(options = {}) {
  const {
    title = 'Max Ischenko',
    description = 'Thoughts on startups, tech, and more. Founder of DOU.ua and Djinni.',
    url = 'https://maxua.com',
    image = null,
    type = 'website',
    twitterCard = 'summary_large_image',
    keywords = 'startups, tech, DOU, Djinni, Ukraine',
    author = 'Max Ischenko',
    publishedTime = null,
    modifiedTime = null
  } = options;

  // Basic meta tags
  let metaTags = `
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="keywords" content="${escapeHtml(keywords)}">
    <meta name="author" content="${escapeHtml(author)}">
    <meta name="robots" content="index, follow">
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${url}">
    
    <!-- Open Graph tags -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="Max Ischenko">
    <meta property="og:locale" content="en_US">
  `;

  // Add image if available
  if (image) {
    metaTags += `<meta property="og:image" content="${image}">\n`;
  }

  // Twitter Card tags
  metaTags += `
    <meta name="twitter:card" content="${twitterCard}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
  `;

  if (image) {
    metaTags += `<meta name="twitter:image" content="${image}">\n`;
  }

  // Article specific tags
  if (type === 'article' && publishedTime) {
    metaTags += `<meta property="article:published_time" content="${publishedTime}">\n`;
    
    if (modifiedTime) {
      metaTags += `<meta property="article:modified_time" content="${modifiedTime}">\n`;
    }
    
    metaTags += `<meta property="article:author" content="${escapeHtml(author)}">\n`;
  }

  return metaTags;
}

/**
 * Generate structured data for a blog post
 * @param {Object} post Post object
 * @param {string} baseUrl Base URL of the website
 * @returns {string} HTML script tag with structured data
 */
function generateBlogPostSchema(post, baseUrl = 'https://maxua.com') {
  if (!post || !post.id) return '';

  const postUrl = `${baseUrl}/p/${post.id}`;
  
  // Extract a description from the post content
  const description = extractDescription(post.content);
  
  // Structure for Blog post schema
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": postUrl
    },
    "headline": truncate(post.content, 110), // Search engines typically display ~55-60 chars
    "description": description,
    "author": {
      "@type": "Person",
      "name": "Max Ischenko",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Person",
      "name": "Max Ischenko",
      "url": baseUrl
    },
    "datePublished": post.created_at,
    "dateModified": post.created_at
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/**
 * Generate structured data for a blog listing page
 * @param {Object} options Configuration options
 * @returns {string} HTML script tag with structured data
 */
function generateBlogListingSchema(options = {}) {
  const {
    url = 'https://maxua.com',
    title = 'Max Ischenko',
    description = 'Thoughts on startups, tech, and more.',
    posts = []
  } = options;

  // Collect the BlogPosting items
  const blogPostings = posts.map(post => {
    const postUrl = `${url}/p/${post.id}`;
    return {
      "@type": "BlogPosting",
      "headline": truncate(post.content, 110),
      "url": postUrl,
      "datePublished": post.created_at,
      "dateModified": post.updated_at || post.created_at,
      "author": {
        "@type": "Person",
        "name": "Max Ischenko"
      }
    };
  });

  // Create the Blog schema
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": title,
    "description": description,
    "url": url,
    "blogPost": blogPostings
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/**
 * Generate structured data for a BreadcrumbList
 * @param {Array} items Array of breadcrumb items
 * @param {string} baseUrl Base URL of the website
 * @returns {string} HTML script tag with structured data
 */
function generateBreadcrumbsSchema(items, baseUrl = 'https://maxua.com') {
  if (!items || !items.length) return '';

  const breadcrumbItems = items.map((item, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "name": item.name,
    "item": item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbItems
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/**
 * Generate structured data for a Person
 * @param {Object} options Configuration options
 * @returns {string} HTML script tag with structured data
 */
function generatePersonSchema(options = {}) {
  const {
    name = 'Max Ischenko',
    url = 'https://maxua.com',
    jobTitle = 'Create things',
    sameAs = [] // Add social media profiles here
  } = options;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": name,
    "url": url,
    "jobTitle": jobTitle
  };

  if (sameAs && sameAs.length) {
    schema.sameAs = sameAs;
  }

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/**
 * Helper function to extract a description from post content
 * @param {string} content Post content
 * @param {number} maxLength Maximum length of description
 * @returns {string} Extracted description
 */
function extractDescription(content, maxLength = 160) {
  if (!content) return '';
  
  // Remove any HTML
  const plainText = content.replace(/<[^>]+>/g, '');
  
  // Remove excessive whitespace
  const normalized = plainText.replace(/\s+/g, ' ').trim();
  
  // Truncate to maxLength
  return truncate(normalized, maxLength);
}

/**
 * Helper function to truncate text
 * @param {string} text Text to truncate
 * @param {number} maxLength Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  
  // Try to truncate at a word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * Helper function to escape HTML special characters
 * @param {string} text Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  generateMetaTags,
  generateBlogPostSchema,
  generateBlogListingSchema,
  generateBreadcrumbsSchema,
  generatePersonSchema,
  extractDescription
};
