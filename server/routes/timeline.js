// server/routes/timeline.js
const express = require('express');
const router = express.Router();
const { pool } = require('../utils');
const templateEngine = require('../templateEngine');
const { 
  generateMetaTags, 
  generateBlogListingSchema,
  generatePersonSchema
} = require('../seo');

/**
 * Main timeline handler - supports both clean URLs and query params
 */
async function handleTimeline(req, res) {
  try {
    // Extract type from URL path
    let typeFilter = null;
    const path = req.path;

    console.log("handleTimeline", path);
    
    if (path === '/links') typeFilter = 'link';
    else if (path === '/quotes') typeFilter = 'quote';
    else if (path === '/texts') typeFilter = 'text';
    else if (path === '/podcast/' || path === '/podcast') typeFilter = 'podcast';
    else if (path === '/articles') typeFilter = 'article';
    // Homepage (/) shows all types
    
    // Get query parameters for pagination
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Validate type filter
    const validTypes = ['link', 'article', 'text', 'podcast', 'quote'];
    const currentFilter = validTypes.includes(typeFilter) ? typeFilter : null;
    
    // Fetch posts with optimized query
    let postsQuery = `
      SELECT * FROM posts p WHERE p.status = 'public'
    `;
    
    const queryParams = [];
    let paramIndex = 1;

    // Add type filter if specified
    if (currentFilter) {
      postsQuery += ` AND p.type = $${paramIndex++}`;
      queryParams.push(currentFilter);
    }
    
    // Add ordering and pagination
    postsQuery += ` ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(limit, offset);
    
    const postsResult = await pool.query(postsQuery, queryParams);
    const posts = postsResult.rows.map(post => {
      // Format the post data for the template
      return {
        ...post,
        content_html: linkifyText(escapeHTML(post.content))
      };
    });
    
    // Update count query to respect filter
    let countQuery = 'SELECT COUNT(*) FROM posts WHERE status = \'public\'';
    let countParams = [];
    
    if (currentFilter) {
      countQuery += ' AND type = $1';
      countParams.push(currentFilter);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    const hasMore = offset + limit < totalCount;
    
    // Check if this is an htmx request
    const isHtmxRequest = req.headers['hx-request'] === 'true' || req.query.htmx === 'true';

    if (isHtmxRequest) {
      const postsHtml = posts.map(post => {
        return templateEngine.render('post-card', post);
      }).join('');

      // Build the load more URL
      const baseUrl = currentFilter ? `/${currentFilter}s` : '/';
      const loadMoreUrl = `${baseUrl}?offset=${offset + limit}&htmx=true`;

      // If no more posts, add script to remove the button
      const footerHtml = !hasMore ? `
        <script>
          (function() {
            var container = document.getElementById('load-more-container');
            if (container) container.remove();
          })();
        </script>
      ` : `
        <!-- Update the load more button with the new offset -->
        <div id="load-more-button" hx-swap-oob="true">
          <button 
             hx-get="${loadMoreUrl}"
             hx-target="#posts-container"
             hx-swap="beforeend"
             class="load-more">
             Load more posts
             <span class="htmx-indicator loading-spinner"></span>
          </button>
        </div>
      `;
      
      // Return the HTMX response
      return res.status(200)
        .set({
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        })
        .send(postsHtml + footerHtml);
    }

    // Generate page title and description
    let pageTitle = "Max Ischenko blog";
    let pageDescription = 'Thoughts on startups and product. Founder of DOU.ua and Djinni.';

    if (currentFilter === 'link') {
      pageTitle = "Links - Max Ischenko";
      pageDescription = "Interesting links and resources";
    } else if (currentFilter === 'quote') {
      pageTitle = "Quotes - Max Ischenko"; 
      pageDescription = "Interesting quotes I found";
    } else if (currentFilter === 'podcast') {
      pageTitle = "Подкаст Startups are hard - Max Ischenko"; 
      pageDescription = "'Startups are hard' latest episodes";
    } else if (currentFilter === 'text') {
      pageTitle = "Short posts - Max Ischenko"; 
      pageDescription = "My microblog :)";
    } else if (currentFilter === 'article') {
      pageTitle = "Articles - Max Ischenko"; 
      pageDescription = "Long-form articles";
    }
    
    // Construct canonical URL
    const canonicalUrl = currentFilter 
      ? `https://maxua.com/${currentFilter}s`
      : 'https://maxua.com';
    
    // Generate meta tags
    const metaTags = generateMetaTags({
      title: pageTitle,
      description: pageDescription,
      url: canonicalUrl,
      keywords: 'startups, tech, Max Ischenko, Ukraine',
    });
    
    // Generate structured data
    const structuredData = [
      generateBlogListingSchema({
        url: canonicalUrl,
        title: pageTitle,
        description: pageDescription,
        posts: posts.slice(0, 10) // Include only the first 10 posts in schema
      }),
      generatePersonSchema({
        sameAs: [
          'https://www.linkedin.com/in/maksim/',
        ]
      })
    ].join('\n');
    
    // Prepare template data
    const templateData = {
      posts,
      cf: currentFilter,
      pagination: {
        offset,
        limit,
        hasMore,
        totalCount
      },
      pageTitle,
      metaTags,
      structuredData
    };
    
    // Render the page
    const html = templateEngine.render('timeline', templateData);
    
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Error rendering timeline page:', error);
    res.status(500).send(`<h1>500 - Server Error</h1><p>${error.message}</p>`);
  }
}

// Route definitions
router.get('/', handleTimeline);
router.get('/texts', handleTimeline);
router.get('/links', handleTimeline);
router.get('/quotes', handleTimeline);
router.get('/podcast', handleTimeline);
router.get('/articles', handleTimeline);

/**
 * Escape HTML special characters
 */
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert URLs to data attributes instead of links
 * This avoids nested anchor tags when making the whole post clickable
 */
function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => 
    `<span class="post-url" data-url="${url}">${url}</span>`
  );
}

module.exports = router;
