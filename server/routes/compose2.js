// Updated server/routes/compose2.js to support post editing
const express = require('express');
const router = express.Router();
const { pool, authMiddleware, generateSlug } = require('../utils');
const templateEngine = require('../templateEngine');
const { sharePostToTelegram } = require('../telegram');
const { sharePostToBluesky } = require('../bluesky');
const fetch = require('node-fetch');

// Display the compose page - updated to support editing mode
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if editing an existing post
    const editPostId = req.query.edit;
    
    // If editing, fetch the post data
    let postData = null;
    
    if (editPostId) {
      const result = await pool.query(
        `SELECT id, content, type, status, metadata, created_at 
         FROM posts 
         WHERE id = $1 AND status = 'public'`,  // Only allow editing published posts
        [editPostId]
      );
      
      if (result.rows.length > 0) {
        postData = result.rows[0];
      } else {
        return res.status(404).send('Post not found or cannot be edited');
      }
    }
    
    const html = templateEngine.render('compose2', {
      pageTitle: editPostId ? 'Edit Post - Max Ischenko' : 'Compose - Max Ischenko',
      editMode: !!editPostId,
      postData: postData || null
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering compose2 page:', error);
    res.status(500).send(`<h1>500 - Server Error</h1><p>${error.message}</p>`);
  }
});

router.post('/fetch-link-meta', authMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }
        
        // Import the function from bluesky.js or utils.js
        const metadata = await fetchUrlMetadata(url);
        
        res.json(metadata);
    } catch (error) {
        console.error('Error fetching URL metadata:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

router.get('/drafts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, content, type, metadata, created_at 
       FROM posts 
       WHERE status = 'draft' 
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

router.delete('/drafts/:id', authMiddleware, async (req, res) => {
  try {
    const draftId = req.params.id;
    console.log("delete", draftId);
    
    // Delete the draft (only if it's actually a draft)
    const result = await pool.query(
      `DELETE FROM posts 
       WHERE id = $1 AND status = 'draft' 
       RETURNING id`,
      [draftId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

router.post('/post', authMiddleware, async (req, res) => {
  try {
    const { content, status, metadata, shareTelegram, shareBluesky, draftId, editPostId } = req.body;
    
    // Basic validation
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'No content found' });
    }

    if (!['draft', 'published'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const newStatus = status === 'published' ? 'public' : status;

    // Validate metadata
    // - Keys must be alphanumeric with underscores
    // - Skip keys with empty values
    // - Convert value to string if needed 
    let validatedMetadata = {};
    if (metadata && typeof metadata === 'object') {
      Object.entries(metadata).forEach(([key, value]) => {
        if (/^[a-zA-Z0-9_]+$/.test(key) && value !== '' && key !== 'key') {
          validatedMetadata[key] = String(value);
        }
      });
    }

    const metadata_json = JSON.stringify(validatedMetadata);

    // Prepare post preview text
    let previewText = content.length > 40 
      ? content.substring(0, content.lastIndexOf(' ', 37) || 37) + '..'
      : content;
    
    previewText = previewText.replace(/[\r\n]+/g, ' ').trim();
    const slug = await generateSlug(previewText);

    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let post;
      
      // EDIT MODE: Updating an existing published post
      if (editPostId && status === 'published') {
        // Verify the post exists and is published
        const checkResult = await client.query(
          `SELECT id, created_at FROM posts WHERE id = $1 AND status = 'public'`,
          [editPostId]
        );
        
        if (checkResult.rows.length === 0) {
          throw new Error('Post not found or is not published');
        }
        
        // Keep the original created_at timestamp when updating
        const originalCreatedAt = checkResult.rows[0].created_at;
        
        // Update the existing post - preserve created_at timestamp
        const result = await client.query(
          `UPDATE posts 
           SET content = $1, preview_text = $2, slug = $3, 
               type = 'text', metadata = $4, updated_at = NOW()
           WHERE id = $5 AND status = 'public'
           RETURNING *`,
          [content, previewText, slug, JSON.stringify(validatedMetadata), editPostId]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Failed to update post');
        }
        
        post = result.rows[0];
      } 
      // DRAFT EDIT MODE: Updating an existing draft
      else if (draftId && status === 'draft') {
        // Verify the draft exists
        const checkResult = await client.query(
          `SELECT id FROM posts WHERE id = $1 AND status = 'draft'`,
          [draftId]
        );
        
        if (checkResult.rows.length === 0) {
          throw new Error('Draft not found');
        }
        
        // Update the existing draft
        const result = await client.query(
          `UPDATE posts 
           SET content = $1, preview_text = $2, slug = $3,
               type = 'text', metadata = $4, updated_at = NOW()
           WHERE id = $5 AND status = 'draft'
           RETURNING *`,
          [content, previewText, slug, JSON.stringify(validatedMetadata), draftId]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Failed to update draft');
        }
        
        post = result.rows[0];
      }
      // PUBLISH FROM DRAFT: Converting a draft to a published post
      else if (draftId && status === 'published') {
        const result = await client.query(
          `UPDATE posts 
           SET content = $1, preview_text = $2, slug = $3, status = $4, 
               type = 'text', metadata = $5, created_at = NOW()
           WHERE id = $6 AND status = 'draft'
           RETURNING *`,
          [content, previewText, slug, newStatus, JSON.stringify(validatedMetadata), draftId]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Draft not found or already published');
        }
        
        post = result.rows[0];
      } 
      // NORMAL MODE: Create a new post or draft
      else {
        const result = await client.query(
          `INSERT INTO posts 
           (content, preview_text, slug, status, type, metadata) 
           VALUES ($1, $2, $3, $4, 'text', $5) 
           RETURNING *`, 
          [content, previewText, slug, newStatus, JSON.stringify(validatedMetadata)]
        );

        if (result.rows.length === 0) {
          throw new Error('Insert failed');
        }
        
        post = result.rows[0];
      }
      
      // If published, handle sharing to various platforms
      // Only share when publishing new posts, not when editing
      if (status === 'published' && !editPostId) {
        // Share to Telegram if enabled
        if (shareTelegram) {
          try {
            await sharePostToTelegram(post);
            console.log(`Post ${post.id} shared to Telegram`);
          } catch (telegramError) {
            console.error('Error sharing to Telegram:', telegramError);
          }
        }
        
        // Share to Bluesky if enabled
        if (shareBluesky) {
          try {
            const blueskyResult = await sharePostToBluesky(post);
            console.log(`Post ${post.id} shared to Bluesky`);
            // we also store bsky post ID for future references;
            if (blueskyResult.success && blueskyResult.postId) {
              await client.query(`
  UPDATE posts
  SET metadata = jsonb_set(metadata, '{bluesky_post_id}', to_jsonb($1::text), true)
  WHERE id = $2`, [blueskyResult.postId, post.id]);
            }
          } catch (blueskyError) {
            console.error('Error sharing to Bluesky:', blueskyError);
          }
        }
      }
      
      await client.query('COMMIT');
      
      return res.status(201).json(post);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating/updating post:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Fetch metadata from a URL for rich embeds
 *
 * @param {string} url - The URL to fetch metadata from
 * @returns {Promise<Object|null>} - Object with title, description, and image URL
 */
async function fetchUrlMetadata(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MaxUA-Microblog/1.0'
      },
      timeout: 5000 // 5 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract Open Graph and basic meta tags
    const metadata = {
      title: extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title') || extractTitle(html) || url,
      description: extractMetaTag(html, 'og:description') || extractMetaTag(html, 'twitter:description') || extractMetaTag(html, 'description') || '',
      image: extractMetaTag(html, 'og:image') || extractMetaTag(html, 'twitter:image') || null
    };
    
    return metadata;
  } catch (error) {
    console.warn(`Error fetching metadata for ${url}:`, error);
    return null;
  }
}

/**
 * Extract meta tag content from HTML
 *
 * @param {string} html - The HTML to parse
 * @param {string} name - The meta tag name or property
 * @returns {string|null} - The content of the meta tag or null
 */
function extractMetaTag(html, name) {
  const ogMatch = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'));
  const ogMatchReverse = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
  
  let content = null;
  if (ogMatch && ogMatch[1]) {
    content = ogMatch[1];
  } else if (ogMatchReverse && ogMatchReverse[1]) {
    content = ogMatchReverse[1];
  }
  
  // Decode HTML entities
  if (content) {
    content = content
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  
  return content;
}

/**
 * Extract title from HTML
 *
 * @param {string} html - The HTML to parse
 * @returns {string|null} - The title tag content or null
 */
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

module.exports = router;
