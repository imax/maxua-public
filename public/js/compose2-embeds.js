// public/js/compose2-embeds.js - Rich embed (link metadata) logic for composeApp
function composeEmbedsModule() {
  return {
    // Track processed URLs to avoid redundant API calls
    processedUrls: {},
    urlDetectionTimer: null,

    // Handle content changes with URL detection
    handleContentChange() {
      this.content = this.$el.value;

      // Debounce URL detection to avoid hammering the server while typing
      clearTimeout(this.urlDetectionTimer);
      this.urlDetectionTimer = setTimeout(() => {
        this.detectAndProcessUrl();
      }, 1000); // 1 second debounce
    },

    // Detect URLs in content and fetch metadata if new
    async detectAndProcessUrl() {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const matches = this.content.match(urlRegex);

      if (!matches || matches.length === 0) return;

      // Process the first URL found (we'll focus on one URL per post for simplicity)
      const url = matches[0];

      // Skip if we've already processed this URL
      if (this.processedUrls[url]) return;

      // Check if we already have metadata for this URL
      const hasExistingUrlMetadata = this.hasUrlInMetadata();
      if (hasExistingUrlMetadata) return;

      try {
        // Mark URL as being processed to prevent duplicate requests
        this.processedUrls[url] = 'processing';

        // Fetch metadata for the URL
        const response = await fetch('/compose/fetch-link-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch URL metadata');
        }

        const metadata = await response.json();
        this.processedUrls[url] = 'completed';

        // Only populate metadata if we have something useful
        if (metadata && (metadata.title || metadata.description || metadata.image)) {
          this.populateMetadataFields(url, metadata);
        }
      } catch (error) {
        console.error('Error fetching URL metadata:', error);
        this.processedUrls[url] = 'error';
      }
    },

    // Check if we already have URL metadata
    hasUrlInMetadata() {
      // Check if we already have url, title, description or image_url in metadata
      const metadataKeys = new Set();
      Object.values(this.metadata).forEach(item => {
        metadataKeys.add(item.key);
      });

      return metadataKeys.has('url') ||
             metadataKeys.has('title') ||
             metadataKeys.has('description') ||
             metadataKeys.has('image_url');
    },

    // Add metadata fields from URL fetch
    populateMetadataFields(url, metadata) {
      const fieldsToAdd = [
        { key: 'url', value: url },
        { key: 'title', value: metadata.title || '' },
        { key: 'description', value: metadata.description || '' },
        { key: 'image_url', value: metadata.image || '' }
      ];

      // Add each field if it doesn't already exist
      fieldsToAdd.forEach(field => {
        // Skip empty values
        if (!field.value) return;

        // Check if this field already exists
        const existingField = Object.values(this.metadata).find(item => item.key === field.key);

        // Don't override existing metadata fields
        if (!existingField) {
          const id = Date.now() + Math.random().toString().slice(2, 8);
          this.metadata[id] = { key: field.key, value: field.value };
        }
      });
    }
  };
}