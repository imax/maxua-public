// server/dailyEmail.js - Daily digest email sender
const { Resend } = require('resend');
const { pool, formatDate, escapeHTML } = require('./utils');
const { render } = require('./templateEngine');
const readline = require('readline');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a daily digest email to all subscribers
 *
 * Updated to use digest_sent field instead of date calculations:
 * - Retrieves posts that haven't been sent in a digest yet (digest_sent IS NULL)
 * - Updates digest_sent timestamp after sending
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.testEmail - If set, only send to this email for testing
 * @param {number|string} options.maxPosts - Maximum number of posts to include (default: 5), can be 'all'
 * @param {boolean} options.dryRun - If true, don't actually send emails
 * @param {boolean} options.askForSubject - If true, prompt for subject selection
 * @returns {Promise<Object>} - Result of the operation
 */
async function sendDailyDigest(options = {}) {
  const {
    testEmail = null,
    maxPosts = 5,
    dryRun = false,
    askForSubject = false,
    customSubject = null
  } = options;

  try {
    // Get posts that haven't been sent in a digest yet
    const { posts, total } = await getUnsentPosts(maxPosts);
    
    if (posts.length === 0) {
      console.log(`No unsent posts, skipping digest`);
      return {
        success: true,
        status: 'skipped',
        reason: 'no_posts'
      };
    }
    
    const remaining = total - posts.length;
    console.log(`Found ${total} total unsent posts`);
    console.log(`Sending ${posts.length}/${total} posts in this digest (${remaining} will remain unsent)`);
    
    // Get confirmed subscribers
    let subscribers = [];
    
    if (testEmail) {
      // Test mode - only send to the test email
      subscribers = [{
        id: 0,
        email: testEmail,
        name: 'Test User',
        unsubscribe_token: 'test-token'
      }];
      console.log(`Test mode: Will send only to ${testEmail}`);
    } else {
      // Get actual subscribers - include both preferences to simplify migration
      const subscribersResult = await pool.query(`
        SELECT id, email, name, unsubscribe_token 
        FROM subscribers 
        WHERE confirmed = true AND (preferences = 'digest' OR preferences = 'single-post')
      `);
      subscribers = subscribersResult.rows;
      console.log(`Found ${subscribers.length} confirmed subscribers`);
    }
    
    if (subscribers.length === 0) {
      console.log('No subscribers found, skipping digest');
      return {
        success: true,
        status: 'skipped',
        reason: 'no_subscribers'
      };
    }
    
    // Format posts data for template
    const formattedPosts = formatPostsForEmail(posts);
    
    // Generate a unique ID for this digest (using date in format YYYYMMDD)
    const today = new Date();
    const digestDate = today.toISOString().slice(0, 10).replace(/-/g, '');
    const digestId = `daily#${digestDate}`;

    const dateFormatted = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Determine the subject line
    let subjectLine;
    
    if (customSubject) {
      // Use provided custom subject
      subjectLine = customSubject;
    } else if (askForSubject) {
      // Ask user to select or create a subject
      subjectLine = await promptForSubject(formattedPosts);
    } else {
      // Default: use preview_text from the latest post
      subjectLine = posts[0].preview_text || posts[0].content.substring(0, 40);
    }

    // Sanitize subject line - remove any newlines and excessive whitespace
    subjectLine = subjectLine.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Some extra magic
    const specialEmail = process.env.SOMEONE_SPECIAL_EMAIL;
    const specialGreeting = process.env.SOMEONE_SPECIAL_GREETING;
    
    // Check if this digest was already sent today
    if (!dryRun && !testEmail) {
      const existingDelivery = await pool.query(
        'SELECT id FROM email_deliveries WHERE delivery_id = $1',
        [digestId]
      );
      
      if (existingDelivery.rows.length > 0) {
        console.log(`Digest for ${digestDate} has already been sent`);
        return { 
          success: false, 
          status: 'skipped', 
          reason: 'already_sent_today',
          digestId
        };
      }
    }
    
    // Create delivery record
    let deliveryDbId = null;

    if (!dryRun && !testEmail) {
      const deliveryResult = await pool.query(
        'INSERT INTO email_deliveries (delivery_id, sent_at, recipient_count, subject) VALUES ($1, NOW(), $2, $3) RETURNING id',
        [digestId, subscribers.length, subjectLine]
      );
      deliveryDbId = deliveryResult.rows[0].id;
    }
    
    // If dry run, just return the preview
    if (dryRun) {
      const baseHtml = render('email-digest', {
        posts: formattedPosts,
        dateFormatted
      });
      return {
        success: true,
        status: 'dry_run',
        subscriberCount: subscribers.length,
        posts: formattedPosts,
        digestId,
        subject: subjectLine,
        htmlPreview: baseHtml.replace('%%unsubscribeUrl%%', 'test-token')
      };
    }
    
    // Send emails in batches
    const BATCH_SIZE = 50;
    let successCount = 0;
    let errorCount = 0;
    
    // Group subscribers into batches
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batchSubscribers = subscribers.slice(i, i + BATCH_SIZE);
      
      // Create batch emails
      const emailBatch = batchSubscribers.map(subscriber => {
        // Unsubscribe URL is unique to each subscriber (email)
        const unsubscribeUrl = `https://maxua.com/api/unsubscribe?token=${subscriber.unsubscribe_token}`;

        let someone_special = null;
        if (specialEmail && specialGreeting && subscriber.email === specialEmail) {
          someone_special = specialGreeting;
        }

        // Render the email -- do it for each subscriber to catch someone_special
        // Also: replaces unsubscribeUrl placeholder with an actual link
        const html = render('email-digest', {
          posts: formattedPosts,
          dateFormatted,
          someone_special
        }).replace('%%unsubscribeUrl%%', unsubscribeUrl); 
        
        // Plain text version (simplified)
        const text = `${subjectLine}\n\n` +
          `This digest includes ${posts.length} recent posts.\n` +
          `Visit https://maxua.com to read all posts.\n\n` +
          `To unsubscribe: ${unsubscribeUrl}`;
        
        return {
          from: 'Max Ischenko <hello@maxua.com>',
          to: [subscriber.email],
          reply_to: 'ischenko@gmail.com',
          subject: subjectLine,
          html: html,
          text: text,
          metadata: {
            digest_id: digestId,
            subscriber_id: subscriber.id
          }
        };
      });
      
      try {
        // Send this batch
        const { data, error } = await resend.batch.send(emailBatch);
        
        if (error) {
          console.error(`Error sending batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
          errorCount += batchSubscribers.length;
          continue;
        }
        
        // Count successful sends in this batch
        const batchSuccessCount = data.data && Array.isArray(data.data)
          ? data.data.filter(item => item.id).length
          : 0;
        successCount += batchSuccessCount;
        
        console.log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: Sent ${batchSuccessCount}/${batchSubscribers.length} emails`);
        
        // Update last_sent_at for subscribers in this batch
        if (batchSuccessCount > 0 && !testEmail) {
          const subscriberIds = batchSubscribers.map(s => s.id);
          await pool.query(
            'UPDATE subscribers SET last_sent_at = NOW() WHERE id = ANY($1)',
            [subscriberIds]
          );
        }
      } catch (batchError) {
        console.error(`Error processing batch ${Math.floor(i/BATCH_SIZE) + 1}:`, batchError);
        errorCount += batchSubscribers.length;
      }
    }
    
    // Update delivery record with actual count
    if (deliveryDbId) {
      await pool.query(
        'UPDATE email_deliveries SET recipient_count = $1 WHERE id = $2',
        [successCount, deliveryDbId]
      );
    }
    
    // Mark all included posts as sent
    if (!dryRun && !testEmail && successCount > 0) {
      const postIds = posts.map(post => post.id);
      await pool.query(
        'UPDATE posts SET digest_sent = NOW() WHERE id = ANY($1)',
        [postIds]
      );
      console.log(`Marked ${postIds.length} posts as sent in digest`);
    }
    
    return {
      success: successCount > 0,
      deliveryId: digestId,
      deliveryDbId,
      sentCount: successCount,
      errorCount: errorCount,
      subject: subjectLine
    };
    
  } catch (error) {
    console.error('Error sending daily digest:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get posts that haven't been sent in a digest yet
 * @param {number|string} limit - Maximum number of posts to get, or 'all' for all unsent posts
 * @returns {Promise<{posts: Array, total: number}>} - Posts array and total unsent count
 */
async function getUnsentPosts(limit = 5) {
  // Get total count of unsent posts first
  const countQuery = `
    SELECT COUNT(*) FROM posts 
    WHERE status = 'public' 
    AND digest_sent IS NULL
  `;
  
  const countResult = await pool.query(countQuery);
  const totalUnsent = parseInt(countResult.rows[0].count);
  
  // Determine the actual limit to use
  let actualLimit = limit;
  const HARD_LIMIT = 25; // Maximum number of posts to include, even with 'all'
  
  if (limit === 'all') {
    actualLimit = Math.min(totalUnsent, HARD_LIMIT);
  } else {
    actualLimit = Math.min(parseInt(limit), HARD_LIMIT);
  }
  
  // Get the posts
  const query = `
    SELECT * FROM posts p
    WHERE status = 'public' 
    AND digest_sent IS NULL
    ORDER BY created_at DESC
    LIMIT $1
  `;
  
  const result = await pool.query(query, [actualLimit]);
  
  return {
    posts: result.rows,
    total: totalUnsent
  };
}

/**
 * Format posts for display in the email
 * @param {Array} posts - Array of post objects from database
 * @returns {Array} - Formatted post objects ready for the template
 */
function formatPostsForEmail(posts) {
  return posts.map(post => {
    // Format the post data for the template, similar to timelinePage.js
    const escapedContent = escapeHTML(post.content);
    
    return {
      ...post,
      formatted_date: formatDate(post.created_at),
      content_html: linkifyContent(escapedContent).replace(/\n/g, '<br>')
    };
  });
}

/**
 * Linkify content but ensure it works well in emails
 * @param {string} text - Text content to linkify
 * @returns {string} - HTML with links properly formatted for email
 */
function linkifyContent(text) {
  if (!text) return '';
  
  // Convert URLs to actual clickable links (for email)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => 
    `<a href="${url}" target="_blank" style="color: #1a73e8; text-decoration: underline; display: inline-block;">${url}</a>`
  );
}

/**
 * Prompt for subject line interactively
 * @param {Array} posts - Array of formatted post objects
 * @returns {Promise<string>} - Selected or custom subject line
 */
async function promptForSubject(posts) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\nSelect a subject line for the digest:');
    
    // Display options based on post preview texts
    posts.forEach((post, index) => {
      let subj = post.preview_text || post.content.substring(0, 40);
      subj = subj.replace(/[\r\n]+/g, ' ').trim();
      if (post.type === 'article' && post.metadata && post.metadata.title) {
        subj = post.metadata.title;
      }
      console.log(`${index + 1}: ${subj}`);
    });
    
    rl.question('\nEnter number OR custom subject line: ', (answer) => {
      const trimmed = answer.trim();
      const idx = parseInt(trimmed, 10);

      if (!isNaN(idx) && idx > 0 && idx <= posts.length) {
        // User selected a post's preview text
        const subject = posts[idx - 1].preview_text || posts[idx - 1].content.substring(0, 40);
        rl.close();
        resolve(subject);
      } else {
        // Treat input as custom subject line
        rl.close();
        resolve(trimmed);
      }
    });
    
  });
}

module.exports = {
  sendDailyDigest
};
