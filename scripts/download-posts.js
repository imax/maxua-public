#!/usr/bin/env node
// download-posts.js - Download posts with date and slug information

// Load environment variables
require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Format date as "Month Day, Year"
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric'
  });
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let days = 7; // Default value
  let outputFile = 'posts.txt'; // Default output file
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && i + 1 < args.length) {
      days = parseInt(args[i + 1]);
      if (isNaN(days)) {
        console.error('Error: --days requires a number');
        process.exit(1);
      }
    } else if (args[i] === '-o' && i + 1 < args.length) {
      outputFile = args[i + 1];
    }
  }
  
  return { days, outputFile };
}

// Main function
async function downloadPosts() {
  try {
    // Get arguments from command line
    const { days, outputFile } = parseArgs();
    console.log(`Downloading posts from the last ${days} days...`);

    // Query posts from the last N days, including slug
    const result = await pool.query(`
      SELECT content, created_at, slug, type, metadata, id 
      FROM posts 
      WHERE status='public' 
      AND created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('No posts found in the specified time period.');
      await pool.end();
      return;
    }

    // Create output file stream
    const outputStream = fs.createWriteStream(outputFile);
    
    // Process each post
    result.rows.forEach((post, index) => {
      const formattedDate = formatDate(post.created_at);
      const slug = post.slug || `post-${post.id}`; // Fallback if slug is missing
      
      // Write metadata and content
      outputStream.write(`ID: ${post.id}\n`);
      outputStream.write(`Date: ${formattedDate}\n`);
      outputStream.write(`Type: ${post.type}\n`);
      outputStream.write(`Slug: ${slug}\n`);
      if (post.metadata && post.metadata !== '{}') {
        const metadata = post.metadata;
        //if (metadata?.url) outputStream.write(`Meta URL: ${metadata.url}\n`);
        //if (metadata?.title) outputStream.write(`Meta Title: ${metadata.title}\n`);
        outputStream.write(`Meta: ${JSON.stringify(post.metadata, null, 2)}\n`);
      }
      outputStream.write(`\n${post.content}\n`);
      
      // Add separator between posts (except for the last one)
      if (index < result.rows.length - 1) {
        outputStream.write('\n---\n\n');
      }
    });

    outputStream.end();
    console.log(`Successfully downloaded ${result.rows.length} posts to ${outputFile}`);
  } catch (error) {
    console.error('Error downloading posts:', error);
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run the script
downloadPosts();
