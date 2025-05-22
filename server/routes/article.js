// server/routes/article.js
const express = require('express');
const router = express.Router();
const { pool, authMiddleware, generateSlug } = require('../utils');
const templateEngine = require('../templateEngine');

// Display the article compose page
router.get('/', authMiddleware, async (req, res) => {
  try {
    const html = templateEngine.render('article-compose', {
      pageTitle: 'Write Article - Max Ischenko'
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering article compose page:', error);
    res.status(500).send(`<h1>500 - Server Error</h1><p>${error.message}</p>`);
  }
});

// Publish article
router.post('/publish', authMiddleware, async (req, res) => {
  try {
    const { title, content } = req.body;
    
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

    // Insert article into posts table
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
    
    const article = result.rows[0];
    
    return res.status(201).json({
      success: true,
      article: article
    });
  } catch (error) {
    console.error('Error creating article:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
