// functions/timelinePage.js

const { pool, getCorsHeaders, getETagHeaders } = require('./utils');
const templateEngine = require('./templateEngine');
const { 
  generateMetaTags, 
  generateBlogListingSchema,
  generatePersonSchema,
  extractDescription
} = require('./seo');

// Register partials
templateEngine.registerPartial('subscription-form', 'subscription-form');

/**
 * Handler for timeline page requests 
 */
exports.handler = async (event, context) => {
  try {
    // Get query parameters
    const query = event.queryStringParameters || {};
    const limit = parseInt(query.limit) || 10;
    const offset = parseInt(query.offset) || 0;
    const typeFilter = query.type;

    // Validate type filter
    const validTypes = ['link', 'article', 'podcast', 'text', 'quote'];
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
    const isHtmxRequest = Boolean(
      (event.headers && (
        event.headers['HX-Request'] === 'true' || 
        event.headers['hx-request'] === 'true')) ||
      event.queryStringParameters?.htmx === 'true'
    );

    if (isHtmxRequest) {
      
      const postsHtml = posts.map(post => {
        return templateEngine.render('post-card', post);
      }).join('');

      const filterParam = currentFilter ? `&type=${currentFilter}` : '';

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
             hx-get="/?offset=${offset + limit}${filterParam}&htmx=true"
             hx-target="#posts-container"
             hx-swap="beforeend"
             class="load-more">
             Load more posts
             <span class="htmx-indicator loading-spinner"></span>
          </button>
        </div>
      `;
      
      // Return the HTMX response
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        body: postsHtml + footerHtml
      };
    }

    let pageTitle = "Max Ischenko blog";
    let pageDescription = 'Thoughts on startups and product. Founder of DOU.ua and Djinni.';

    if (currentFilter === 'link') {
      pageTitle = "Links - Max Ischenko";
      pageDescription = "Interesting links and resources";
    } else if (currentFilter === 'quote') {
      pageTitle = "Quotes - Max Ischenko"; 
      pageDescription = "Interesting quotes I found";
    } else if (currentFilter === 'article') {
      pageTitle = "Articles - Max Ischenko"; 
      pageDescription = "Long-form articles";
    } else if (currentFilter === 'podcast') {
      pageTitle = "Podcast - Max Ischenko";
      pageDescription = "Episodes from 'Startups are Hard' podcast";
    }

    if (currentFilter) {
      const capitalizedFilter = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);
      pageTitle += ` #${capitalizedFilter}`;
    }
    
    // Construct canonical URL
    const canonicalUrl = currentFilter 
      ? `https://maxua.com/?type=${currentFilter}`
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
          // Add other social profiles here
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
    
    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(),
        //...getETagHeaders(posts),
      },
      body: html
    };
  } catch (error) {
    console.error('Error rendering timeline page:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>500 - Server Error</h1><p>${error.message}</p>`
    };
  }
};

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
  // Instead of creating anchor tags, mark URLs with a data attribute
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => 
    `<span class="post-url" data-url="${url}">${url}</span>`
  );
}
