// server/routes/archive.js
const express = require('express');
const router = express.Router();
const { pool } = require('../utils');
const templateEngine = require('../templateEngine');

router.get('/', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || 2025;
    
    // Query posts for the specified year
    const postsResult = await pool.query(`
      SELECT id, content, preview_text, created_at, type 
      FROM posts 
      WHERE status = 'public' 
        AND EXTRACT(YEAR FROM created_at) = $1
      ORDER BY created_at DESC
    `, [year]);
    
    // Get all available years for the "Other years" links
    const yearsResult = await pool.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM created_at) as year
      FROM posts 
      WHERE status = 'public'
      ORDER BY year DESC
    `);
    
    const availableYears = yearsResult.rows.map(row => parseInt(row.year));
    const otherYears = availableYears.filter(y => y !== year);
    
    // Group posts by week
    const postsByWeek = groupPostsByWeek(postsResult.rows, year);
    
    // Render the template
    const html = templateEngine.render('archive', {
      year,
      postsByWeek,
      otherYears,
      pageTitle: `Archive ${year} - Max Ischenko`
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering archive page:', error);
    res.status(500).send(`<h1>500 - Server Error</h1><p>${error.message}</p>`);
  }
});

/**
 * Group posts by week within a year
 */
function groupPostsByWeek(posts, year) {
  const weeks = {};
  
  posts.forEach(post => {
    const postDate = new Date(post.created_at);
    const weekKey = getWeekKey(postDate);
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = {
        weekRange: getWeekRange(postDate),
        posts: []
      };
    }
    
    // Truncate preview_text to safe length
    const previewText = post.preview_text || post.content || '';
    const truncatedPreview = previewText.length > 70 
      ? previewText.substring(0, 67) + '...'
      : previewText;
    
    weeks[weekKey].posts.push({
      ...post,
      truncatedPreview: truncatedPreview.replace(/\n/g, ' ').trim()
    });
  });
  
  // Convert to array and sort by week (newest first)
  return Object.keys(weeks)
    .sort((a, b) => b.localeCompare(a)) // Sort week keys descending
    .map(weekKey => weeks[weekKey]);
}

/**
 * Get a sortable week key (YYYY-MM-DD format of the Monday)
 */
function getWeekKey(date) {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so Sunday needs to go back 6 days
  monday.setDate(monday.getDate() - daysToMonday);
  
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get formatted week range (e.g., "May 12-19")
 */
function getWeekRange(date) {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  monday.setDate(monday.getDate() - daysToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const mondayMonth = monthNames[monday.getMonth()];
  const sundayMonth = monthNames[sunday.getMonth()];
  
  if (monday.getMonth() === sunday.getMonth()) {
    // Same month: "May 12-19"
    return `${mondayMonth} ${monday.getDate()}-${sunday.getDate()}`;
  } else {
    // Different months: "April 28 - May 4"
    return `${mondayMonth} ${monday.getDate()} - ${sundayMonth} ${sunday.getDate()}`;
  }
}

module.exports = router;
