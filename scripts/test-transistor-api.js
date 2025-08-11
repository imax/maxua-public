#!/usr/bin/env node
// scripts/test-transistor-api.js
// Test script to explore Transistor.fm API and find the right endpoints

require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.TRANSISTOR_API_KEY;
const BASE_URL = 'https://api.transistor.fm/v1';

if (!API_KEY) {
  console.error('❌ TRANSISTOR_API_KEY not found in environment');
  process.exit(1);
}

/**
 * Make an API request to Transistor.fm
 */
async function transistorRequest(endpoint) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`\n🔍 GET ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Success (${response.status})`);
    return data;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🎙️ Testing Transistor.fm API');
  console.log('=' .repeat(50));
  
  // Test 1: Get user info (we know this works)
  console.log('\n📋 Test 1: User Info');
  const userInfo = await transistorRequest('');
  if (userInfo) {
    console.log(`User: ${userInfo.data.attributes.name}`);
  }
  
  // Test 2: Get shows/podcasts
  console.log('\n📋 Test 2: Shows/Podcasts');
  const shows = await transistorRequest('/shows');
  if (shows && shows.data) {
    console.log(`Found ${shows.data.length} show(s):`);
    shows.data.forEach(show => {
      console.log(`- ID: ${show.id}, Title: ${show.attributes.title}`);
    });
    
    // Test 3: Try different ways to get episodes
    if (shows.data.length > 0) {
      const showId = shows.data[0].id;
      console.log(`\n📋 Test 3: Episodes for show ${showId}`);
      
      // Try different episode endpoints
      const episodeEndpoints = [
        `/episodes?show_id=${showId}&limit=5`,
        `/episodes?show_id=${showId}`,
        `/episodes`,
        `/shows/${showId}/episodes`
      ];
      
      for (const endpoint of episodeEndpoints) {
        console.log(`\nTrying: ${endpoint}`);
        const episodes = await transistorRequest(endpoint);
        if (episodes && episodes.data) {
          console.log(`✅ Found ${episodes.data.length} episode(s) with endpoint: ${endpoint}`);
          if (episodes.data.length > 0) {
            const episode = episodes.data[0];
            const attrs = episode.attributes;
            console.log(`Sample episode:`);
            console.log(`- ID: ${episode.id}`);
            console.log(`- Title: ${attrs.title}`);
            console.log(`- Share URL: ${attrs.share_url || 'No share URL'}`);
            console.log(`- Embed HTML available: ${attrs.embed_html ? 'Yes' : 'No'}`);
            if (attrs.embed_html) {
              console.log(`- Embed HTML: ${attrs.embed_html.substring(0, 100)}...`);
            }
            
            // Look for any field that might match your embed codes
            console.log(`- Looking for embed code patterns:`);
            Object.keys(attrs).forEach(key => {
              const value = attrs[key];
              if (typeof value === 'string' && (value.includes('1a2347a2') || value.length < 20)) {
                console.log(`  ${key}: ${value}`);
              }
            });
            break; // Stop after finding working endpoint
          }
        }
      }
    }
  }
  
  // Test 4: Check what your embed code might be
  console.log('\n📋 Test 4: Understanding Embed Codes');
  
  // Let's check the share URL format from Transistor
  // Your embed code is 1a2347a2, which might be extracted from share URLs
  console.log('Your current embed code: 1a2347a2');
  console.log('Share URL format: https://share.transistor.fm/e/1a2347a2');
  console.log('This suggests the embed code IS the episode identifier for sharing');
  
  // Let's try some other episode endpoints that might work
  const alternativeEndpoints = [
    '/analytics/downloads', // Might list episodes
    '/publishing_queue',    // Might show published episodes
  ];
  
  for (const endpoint of alternativeEndpoints) {
    console.log(`\nTrying: ${endpoint}`);
    const result = await transistorRequest(endpoint);
    if (result) {
      console.log(`✅ Response received for ${endpoint}`);
      if (result.data && Array.isArray(result.data)) {
        console.log(`Found ${result.data.length} items`);
      }
    }
  }
  
  console.log('\n🎯 Summary');
  console.log('=' .repeat(50));
  console.log('Next steps:');
  console.log('1. Identify the relationship between your embed codes and episode IDs');
  console.log('2. Find the best endpoint to get embed_html');
  console.log('3. Test with your actual podcast episodes');
}

// Run the script
main().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});
