// functions/postPage.js
const { pool, escapeHTML, linkify, formatDate, getCorsHeaders, getETagHeaders } = require('./utils');
const templateEngine = require('./templateEngine');
const { 
  generateMetaTags,
  generateBlogPostSchema,
  generateBreadcrumbsSchema,
  generatePersonSchema,
  extractDescription
} = require('./seo');

console.log("postPage loaded");

/**
 * Handler for post page requests
 */
exports.handler = async (event) => {

  try {
    const postId = extractPostIdFromPath(event.path);
    
    if (!postId) {
      return createErrorResponse(400, 'Bad Request');
    }
    
    const post = await fetchPost(postId);
    
    if (!post) {
      return createErrorResponse(404, 'Post Not Found');
    }
    
    // Fetch previous and next post IDs for navigation
    const navLinks = await fetchPrevNextPostIds(postId);
    
    // Prepare the template data
    const templateData = await prepareTemplateData(post, event, navLinks);
    
    // Render the page
    const html = templateEngine.render('post', templateData);
    
    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(),
        ...getETagHeaders(post),
      },
      body: html
    };
  } catch (error) {
    console.error('Error rendering post page:', error);
    return createErrorResponse(500, 'Server Error');
  }
};

/**
 * Extract post ID from the request path
 */
function extractPostIdFromPath(path) {
  // Extract ID from the new format: /p/slug-123
  const match = path.match(/\/p\/.*?-(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Fetch post data from the database
 */
async function fetchPost(postId) {
  // First, fetch the post with its topic
  const postResult = await pool.query(`
    SELECT p.*, t.id as topic_id, t.name as topic_name, t.slug as topic_slug 
    FROM posts p
    LEFT JOIN topics t ON p.topic_id = t.id
    WHERE p.id = $1 AND p.status='public'
  `, [postId]);
  
  const post = postResult.rows.length ? postResult.rows[0] : null;
  
  return post;
}

/**
 * Fetch previous and next post IDs for navigation
 * Uses global timeline regardless of topic
 * Note: "next" means newer post, "prev" means older post
 */
async function fetchPrevNextPostIds(currentPostId) {
  const query = `
    WITH current_post AS (
      SELECT created_at FROM posts WHERE id = $1
    )
    SELECT 
      prev.id AS prev_id, 
      prev.preview_text AS prev_preview,
      prev.slug AS prev_slug,
      next.id AS next_id, 
      next.preview_text AS next_preview,
      next.slug AS next_slug
    FROM current_post cp
    LEFT JOIN LATERAL (
      SELECT id, preview_text, slug
      FROM posts
      WHERE created_at < cp.created_at
      AND status='public'
      ORDER BY created_at DESC
      LIMIT 1
    ) prev ON true
    LEFT JOIN LATERAL (
      SELECT id, preview_text, slug
      FROM posts
      WHERE created_at > cp.created_at
      AND status='public'
      ORDER BY created_at ASC
      LIMIT 1
    ) next ON true
  `;
  
  const result = await pool.query(query, [currentPostId]);
    
  if (result.rows.length === 0) {
    return {};
  }

  const data = result.rows[0];

  return {
    prevPostId: data.prev_id || null,
    prevPostText: data.prev_preview || null,
    prevPostSlug: data.prev_slug || null,
    nextPostId: data.next_id || null,
    nextPostText: data.next_preview || null,
    nextPostSlug: data.next_slug || null
  };
}

/**
 * Prepare data for template rendering
 */
async function prepareTemplateData(post, event, navLinks) {
  // Format and process the post content
  const postContent = linkify(post.content);
  
  // Create a clean preview for the title (up to 50 chars)
  const previewContent = post.content.replace(/\n/g, ' ').trim();
  const previewTitle = previewContent.length > 50 
    ? previewContent.substring(0, 47) + '...'
    : previewContent;

  // Fetch pinned comments
  const commentsQuery = `
    SELECT id, author, content, created_at 
    FROM comments2 
    WHERE post_id = $1 AND pinned = true 
    ORDER BY created_at ASC
  `;
  const commentsResult = await pool.query(commentsQuery, [post.id]);
  const pinnedComments = commentsResult.rows.map(comment => ({
    ...comment,
    formatted_date: formatDate(comment.created_at),
    content_html: linkify(comment.content)
  }));
  
  // Format nav links as post objects for the permalink helper
  if (navLinks.prevPostId) {
    navLinks.prev = {
      id: navLinks.prevPostId,
      slug: navLinks.prevPostSlug
    };
  }
  
  if (navLinks.nextPostId) {
    navLinks.next = {
      id: navLinks.nextPostId,
      slug: navLinks.nextPostSlug
    };
  }

  // Format the date
  const formattedDate = formatDate(post.created_at);
  
  // Extract description for meta tags
  const description = extractDescription(post.content, 160);
  
  // Build the full canonical URL
  const domain = 'https://maxua.com';
  const canonicalUrl = `${domain}/p/${post.id}`;
  
  // Generate meta tags for SEO
  const metaTags = generateMetaTags({
    title: previewTitle,
    description,
    url: canonicalUrl,
    type: 'article',
    publishedTime: post.created_at,
    modifiedTime: post.created_at,
    // Add topic as a keyword if available
    keywords: post.topic_name 
      ? `${post.topic_name}, startups, tech, Max Ischenko` 
      : 'startups, tech, Max Ischenko'
  });
  
  // Generate breadcrumb structured data
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: previewTitle, url: `/p/${post.id}` }
  ];
  
  // If post has a topic, add it to breadcrumbs
  if (post.topic_name && post.topic_slug) {
    breadcrumbItems.splice(1, 0, { 
      name: post.topic_name, 
      url: `/t/${post.topic_slug}` 
    });
  }
  
  // Generate structured data for this post
  const structuredData = [
    generateBlogPostSchema(post, domain),
    generateBreadcrumbsSchema(breadcrumbItems, domain),
    generatePersonSchema({
      sameAs: [
        'https://www.linkedin.com/in/maksim/',
        // Add your other profiles here
      ]
    })
  ].join('\n');
  
  return {
    post: {
      ...post,
      content_html: postContent,
      formatted_date: formattedDate
    },
    postTitle: previewTitle,
    metaTags,
    structuredData,
    pinnedComments,
    navLinks
  };
}

/**
 * Create a standardized error response
 */
function createErrorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html' },
    body: `<h1>${statusCode} - ${message}</h1>`
  };
}

/**
 * Format duration in MM:SS
 */
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
