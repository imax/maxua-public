// server/bluesky.js
const { BskyAgent } = require('@atproto/api');
const fetch = require('node-fetch');

/**
 * Share a blog post to Bluesky
 * 
 * @param {Object} post - The post object to share
 * @returns {Promise<Object>} - The Bluesky API response
 */
async function sharePostToBluesky(post) {
  if (!post || !post.content) {
    throw new Error('Invalid post data');
  }

  // Get Bluesky credentials from environment variables
  const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME;
  const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD;

  if (!BLUESKY_USERNAME || !BLUESKY_PASSWORD) {
    throw new Error('BLUESKY_USERNAME or BLUESKY_PASSWORD is not set');
  }
  
  try {
    // Create and authenticate the Bluesky agent
    const agent = new BskyAgent({
      service: 'https://bsky.social'
    });

    await agent.login({
      identifier: BLUESKY_USERNAME,
      password: BLUESKY_PASSWORD
    });

    // Prepare the content and check for metadata
    let content = post.content;
    let postMetadata = null;
    
    // Check if post has metadata
    if (post.metadata) {
      // Handle case when metadata is a JSON string
      if (typeof post.metadata === 'string') {
        try {
          postMetadata = JSON.parse(post.metadata);
        } catch (e) {
          console.warn('Failed to parse metadata JSON:', e);
        }
      } else {
        postMetadata = post.metadata;
      }
    }
    
    // Create the facets for rich text features (links, mentions, etc)
    const facets = createFacets(content);
    
    // Create post record with proper rich text handling
    const postRecord = {
      text: content,
      createdAt: new Date().toISOString(),
    };

    // Add facets if we have any
    if (facets.length > 0) {
      postRecord.facets = facets;
    }

    // Handle post images (authored content)
    if (postMetadata && postMetadata.post_image) {
      try {
        // Fetch the image
        const imageResponse = await fetch(postMetadata.post_image, {
          headers: { 'User-Agent': 'MaxUA-Microblog/1.0' },
          timeout: 10000
        });
        
        if (imageResponse.ok) {
          // Get the image as a buffer
          const imageBuffer = await imageResponse.buffer();
          
          // Upload the image
          const upload = await agent.uploadBlob(imageBuffer, {
            encoding: 'image/jpeg' // Using JPEG as a safe default
          });
          
          if (upload && upload.data && upload.data.blob) {
            // Create image embed
            postRecord.embed = {
              $type: 'app.bsky.embed.images',
              images: [{
                alt: '', // Empty alt text as these are my authored images
                image: upload.data.blob
              }]
            };
          }
        }
      } catch (imageError) {
        console.error('Error uploading post image:', imageError);
        throw new Error(`Failed to upload post image: ${imageError.message}`);
      }
    }
    
    // Handle rich link embeds (only if no post image)
    // Note: Bluesky doesn't support multiple embed types in one post
    if (!postRecord.embed && postMetadata && postMetadata.url && postMetadata.title) {
      try {
        // Create basic embed without image first
        const embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: postMetadata.url,
            title: postMetadata.title,
            description: postMetadata.description || ''
          }
        };
        
        // If we have an image URL for the link, try to upload it
        if (postMetadata.image_url) {
          try {
            // Fetch the image
            const imageResponse = await fetch(postMetadata.image_url, {
              headers: { 'User-Agent': 'MaxUA-Microblog/1.0' },
              timeout: 5000
            });
            
            if (imageResponse.ok) {
              // Get the image as a buffer
              const imageBuffer = await imageResponse.buffer();
              
              // Attempt to upload the image
              const upload = await agent.uploadBlob(imageBuffer, {
                encoding: 'image/jpeg' // Using JPEG as a safe default
              });
              
              // If upload successful, add the image to the embed
              if (upload && upload.data && upload.data.blob) {
                embed.external.thumb = upload.data.blob;
              }
            }
          } catch (imageError) {
            console.warn('Error uploading link preview image, continuing without thumbnail:', imageError.message);
            // Continue without the image
          }
        }
        
        // Add the embed to the post
        postRecord.embed = embed;
      } catch (embedError) {
        console.warn('Failed to create rich embed:', embedError.message);
        // Continue without embed if this fails
      }
    }

    // Create the post with the rich text and embed
    const postResult = await agent.post(postRecord);

    // Extract the post ID from the URI
    const postUri = postResult.uri;
    let postId = null;
    if (typeof postUri === 'string' && postUri.includes('/')) {
      const parts = postUri.split('/');
      postId = parts[parts.length - 1] || null;
    }
    
    return {
      success: true,
      postUri: postUri,
      postId: postId
    };
  } catch (error) {
    console.error('Error sharing to Bluesky:', error);
    throw error;
  }
}

/**
 * Create facets for rich text features in Bluesky posts
 * 
 * @param {string} text - The post text to parse for links
 * @returns {Array} - Array of facet objects for the Bluesky API
 */
function createFacets(text) {
  const facets = [];
  
  // Add link facets
  const linkFacets = detectLinks(text);
  facets.push(...linkFacets);
  
  return facets;
}

/**
 * Detect links in text and create facets for them
 * 
 * @param {string} text - The text to search for links
 * @returns {Array} - Array of link facets
 */
function detectLinks(text) {
  const facets = [];
  // Improved URL regex pattern for more accurate link detection
  const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  
  // We need to work with bytes for the facet indexes
  const textEncoder = new TextEncoder();
  
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0];
    const matchIndex = match.index;
    
    // Convert character indexes to byte indexes
    const beforeMatch = text.substring(0, matchIndex);
    const matchText = text.substring(matchIndex, matchIndex + url.length);
    
    const byteStart = textEncoder.encode(beforeMatch).length;
    const byteEnd = byteStart + textEncoder.encode(matchText).length;
    
    facets.push({
      index: {
        byteStart,
        byteEnd
      },
      features: [
        {
          $type: "app.bsky.richtext.facet#link",
          uri: url
        }
      ]
    });
  }
  
  return facets;
}

module.exports = {
  sharePostToBluesky
};
