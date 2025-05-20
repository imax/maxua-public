// functions/telegram.js
const fetch = require('node-fetch');
const { pool, getPostPermalink } = require('./utils');

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '-1002652195351';

/**
 * Send a message to Telegram
 * 
 * @param {string} text - The text message to send
 * @param {Object} options - Additional Telegram API options
 * @returns {Promise<Object>} - The Telegram API response
 */
async function sendTelegramMessage(text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    ...options
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', errorText);
      throw new Error(`Telegram API returned ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
    throw error;
  }
}

/**
 * Share a blog post to Telegram
 * 
 * @param {Object} post - The post object to share
 * @returns {Promise<Object>} - The Telegram API response
 */
async function sharePostToTelegram(post) {
  if (!post || !post.id || !post.content) {
    throw new Error('Invalid post data');
  }

  // Format the post content for Telegram
  const postUrl = `https://maxua.com${getPostPermalink(post)}`;

  let content = post.content;

  // Check if post has metadata URL
  if (post.metadata) {
    // Handle case when metadata is a JSON string
    let metadata = post.metadata;
    if (typeof post.metadata === 'string') {
      try {
        metadata = JSON.parse(post.metadata);
      } catch (e) {
        console.warn('Failed to parse metadata JSON:', e);
      }
    }
    
    // Check if metadata contains a URL that's not already in the content
    if (metadata.url && !content.includes(metadata.url)) {
      // Append the URL to the content
      content += `\n\n${metadata.url}`;
    }
  }
  
  // Escape any HTML in the content (but preserve line breaks)
  const escapedContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Format the message
  let message = escapedContent.split('\n').join('\n');

  // Add post link at the end
  message += `\n\n<b>${postUrl}</b>`;

  // Send to Telegram
  const result = await sendTelegramMessage(message);

  // result.result?.message_id -- in case we want to store it in out db
  
  return result;
}

module.exports = {
  sendTelegramMessage,
  sharePostToTelegram
};
