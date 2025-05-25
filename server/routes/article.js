// server/routes/article.js
const express = require('express');
const router = express.Router();
const { pool, authMiddleware, generateSlug } = require('../utils');
const templateEngine = require('../templateEngine');

// Display the article compose page - now supports editing
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if editing an existing article
    const editPostId = req.query.edit;
    
    let articleData = null;
    
    if (editPostId) {
      const result = await pool.query(
        `SELECT id, content, metadata, created_at 
         FROM posts 
         WHERE id = $1 AND status = 'public' AND type = 'article'`,
        [editPostId]
      );
      
      if (result.rows.length > 0) {
        const post = result.rows[0];
        
        // Parse metadata to get title
        let metadata = {};
        if (post.metadata) {
          try {
            metadata = typeof post.metadata === 'string' 
              ? JSON.parse(post.metadata) 
              : post.metadata;
          } catch (e) {
            console.warn('Failed to parse article metadata:', e);
          }
        }
        
        articleData = {
          id: post.id,
          title: metadata.title || '',
          content: post.content || '',
          created_at: post.created_at
        };
      } else {
        return res.status(404).send('Article not found or cannot be edited');
      }
    }
    
    const html = templateEngine.render('article-compose', {
      pageTitle: editPostId ? 'Edit Article - Max Ischenko' : 'Write Article - Max Ischenko',
      editMode: !!editPostId,
      articleData: articleData || null
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering article compose page:', error);
    res.status(500).send(`<h1>500 - Server Error</h1><p>${error.message}</p>`);
  }
});

// Publish article - now handles both create and update
router.post('/publish', authMiddleware, async (req, res) => {
  try {
    const { title, content, editPostId } = req.body;
    
    // Basic validation
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Prepare metadata with title
    const metadata = {
      title: title.trim()
    };

    // Generate preview text from title (first 40 chars)
    const previewText = title.length > 40 
      ? title.substring(0, title.lastIndexOf(' ', 37) || 37) + '..'
      : title;
    
    // Generate slug from title
    const slug = await generateSlug(title);

    let article;
    
    if (editPostId) {
      // UPDATE existing article
      const result = await pool.query(
        `UPDATE posts 
         SET content = $1, preview_text = $2, slug = $3, metadata = $4, updated_at = NOW()
         WHERE id = $5 AND status = 'public' AND type = 'article'
         RETURNING *`, 
        [content.trim(), previewText, slug, JSON.stringify(metadata), editPostId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found or cannot be updated' });
      }
      
      article = result.rows[0];
    } else {
      // CREATE new article
      const result = await pool.query(
        `INSERT INTO posts 
         (content, preview_text, slug, status, type, metadata) 
         VALUES ($1, $2, $3, 'public', 'article', $4) 
         RETURNING *`, 
        [content.trim(), previewText, slug, JSON.stringify(metadata)]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to create article');
      }
      
      article = result.rows[0];
    }
    
    return res.status(201).json({
      success: true,
      article: article,
      isEdit: !!editPostId
    });
  } catch (error) {
    console.error('Error creating/updating article:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
