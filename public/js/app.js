// public/js/app.js

import { isDevBypassEnabled, isAuthenticated } from './auth.js';

const ANON_ID_KEY = 'anon_id';

const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/**
 * Get or generate anonymous ID for the current user
 * @returns {string} Anonymous user ID
 */
export function getAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  let legacy_id = localStorage.getItem('microblog_anon_id');
  if (!id) {
    if (legacy_id) {
      id = legacy_id;
    } else {
      id = 'anon_' + Math.random().toString(36).substring(2, 12);
    }
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

/**
 * This counts how many times a visitor returns to the site
 */
function countReturnVisits() {
  const anonId = getAnonId();
  
  const VISIT_COUNT_KEY = "visits_count";
  
  let visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0');
  visitCount++;
  
  localStorage.setItem(VISIT_COUNT_KEY, visitCount.toString());
}

/**
 * Track page view for analytics
 * @param {string} pathname Page path
 * @param {string} anonId Anonymous user ID
 */
export async function trackPageView(pathname, anonId) {
  try {
    await fetch('/track-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathname: pathname || window.location.pathname,
        anonId: anonId,
        referrer: document.referrer || null
      })
    });
  } catch (err) {
    console.error('Failed to track page view', err);
  }
}

function setupTranslationButtons() {
  const containsCyrillic = text => /[\u0400-\u04FF]/.test(text.trim());
  
  // Find all translation buttons
  document.querySelectorAll('.translate-link').forEach(button => {
    const postId = button.dataset.postId;
    const postCard = button.closest('.post-card');
    
    if (!postCard) {
      console.error(`Could not find post card for button with post ID ${postId}`);
      return;
    }
    
    const contentElement = postCard.querySelector('.post-content');
    
    if (!contentElement) {
      console.error('Could not find post content element within post card');
      return;
    }
    
    // Hide the button if the content doesn't contain Cyrillic characters
    if (!containsCyrillic(contentElement.textContent)) {
      button.style.display = 'none';
      return;
    }
    
    // Set up click handler for the button
    button.addEventListener('click', async function(e) {
      e.preventDefault();
      
      // If already translated, toggle back to original
      if (this.dataset.translated === 'true') {
        contentElement.innerHTML = this.dataset.original;
        this.textContent = 'Translate';
        this.dataset.translated = 'false';
        return;
      }
      
      // Store original content
      const originalContent = contentElement.innerHTML;
      this.dataset.original = originalContent;
      
      // Change button text to indicate loading
      this.textContent = 'Translating...';
      this.disabled = true;
      
      try {
        // Call the translation API
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            postId: postId
          })
        });
        
        if (!response.ok) throw new Error('Translation failed');
        
        const data = await response.json();
        
        // Update the content with translation
        contentElement.innerHTML = data.translation;
        this.textContent = 'Show original';
        this.dataset.translated = 'true';
      } catch (error) {
        console.error('Translation error:', error);
        
        // Restore original content
        contentElement.innerHTML = originalContent;
        this.textContent = 'Translate';
        alert('Translation failed. Please try again later.');
      } finally {
        // Re-enable the button
        this.disabled = false;
      }
    });
  });
}

async function initAdminProfile() {
  const isAdmin = await isAuthenticated();
  
  if (isAdmin) {
    const profileImage = document.querySelector('.profile-image');
    const profileLink = profileImage.parentElement;
    
    profileLink.href = '/compose';
    profileLink.classList.add('admin-profile-link');
  }
}

/**
 * Initialize the application
 */
function initApp() {
  // Enable dev bypass for local development
  if (isDev) {
    localStorage.setItem('microblog_dev_bypass', 'true');
    console.log('🔓 Dev bypass enabled');
  }

  initAdminProfile();
  setupTranslationButtons();
  
  // Track page view for analytics
  if (!isDev) {
    trackPageView(window.location.pathname, getAnonId());
  }

  countReturnVisits(); 
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initApp);
