// Main public/js/compose2.js; drafts and embeds logic extracted to separate modules
function composeApp() {
    return {
        ...composeDraftsModule(),
        ...composeEmbedsModule(),
        content: '',
        metadata: {},       // Stores fields with key and value properties
        submitting: null,   // null, 'draft', or 'published'
        postType: 'text', 
        statusMessage: '',
        statusType: '',
        shareTelegram: true,
        shareBluesky: true,
        isEditMode: false,
        editPostId: null,
        
        
        // Initialize
        async init() {
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Skip if user is in a form field that isn't the compose textarea
                if (document.activeElement.tagName === 'INPUT' || 
                   (document.activeElement.tagName === 'TEXTAREA' && 
                    !document.activeElement.classList.contains('compose-textarea'))) {
                    return;
                }
                
                // Ctrl+Enter to publish/update
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.submitPost('published');
                }
                
                // Ctrl+S to save draft (only in non-edit mode)
                if ((e.ctrlKey || e.metaKey) && e.key === 's' && !this.isEditMode) {
                    e.preventDefault();
                    this.submitPost('draft');
                }
                
                // Escape to cancel edit
                if (e.key === 'Escape' && this.isEditMode) {
                    e.preventDefault();
                    this.resetForm();
                }
            });
            
            this.setupPasteDetection(); // postType auto-select

            await this.initDrafts();
        },


        initWithEditDataFromDOM() {
            const dataElement = document.getElementById('edit-post-data');
            if (!dataElement || !dataElement.value) return;

            try {
                // Parse the JSON data from the hidden input
                const postData = JSON.parse(dataElement.value);

                // Set edit mode
                this.isEditMode = true;
                this.editPostId = postData.id;

                // Set content
                this.content = postData.content || '';
                this.postType = postData.type || 'text';

                // Parse and set metadata
                this.metadata = {};
                if (postData.metadata) {
                    let metadataObj = {};

                    // Handle stringified JSON
                    if (typeof postData.metadata === 'string') {
                        try {
                            metadataObj = JSON.parse(postData.metadata);
                        } catch (e) {
                            console.error('Error parsing metadata JSON:', e);
                        }
                    } else {
                        metadataObj = postData.metadata;
                    }

                    // Convert to our format with IDs
                    Object.entries(metadataObj).forEach(([key, value]) => {
                        const id = Date.now() + Math.random().toString().slice(2, 8);
                        this.metadata[id] = { key, value: String(value) };
                    });

                    // If there's a URL in metadata, mark it as processed
                    if (metadataObj.url) {
                        this.processedUrls[metadataObj.url] = 'completed';
                    }
                }

                // Disable sharing options in edit mode - we don't reshare edited posts
                this.shareTelegram = false;
                this.shareBluesky = false;

                setTimeout(() => {
                    const textarea = document.querySelector('.compose-textarea');
                    if (textarea) {
                        textarea.style.height = 'auto';
                        textarea.style.height = Math.min(textarea.scrollHeight, 600) + 'px';
                        textarea.focus();
                        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                    }
                }, 0);

                console.log('Initialized edit mode for post:', postData.id);
            } catch (error) {
                console.error('Error initializing edit data:', error);
                this.showStatus('Error loading post data for editing', 'error');
            }
        },

        // Metadata functions
        isValidKey(key) {
            if (!key) return false;
            return /^[a-zA-Z0-9_]+$/.test(key);
        },
        
        addEmptyMetadataField() {
            // Add an empty field with both key and value as properties
            const id = Date.now().toString();
            this.metadata[id] = { key: 'key', value: '' };
          //
            // Focus on the new field after it's added
            // We need to wait for the DOM to update
            setTimeout(() => {
                const fields = document.querySelectorAll('.metadata-key');
                if (fields.length > 0) {
                    // Focus on the last added field (most recent)
                    fields[fields.length - 1].focus();
                }
            }, 50); // Small delay to ensure DOM update
        },
        
        addMetadataWithKey(keyName) {
            // Add a field with a predefined key
            const id = Date.now().toString();
            this.metadata[id] = { key: keyName, value: '' };
        },
        
        removeMetadataField(id) {
            delete this.metadata[id];
        },
        
        // Submit post (handles both draft and publish, as well as editing)
        async submitPost(status) {
            if (this.submitting) return; // Prevent double submission
            this.submitting = status;

            try {
                // Convert our metadata structure to a flat object
                const flatMetadata = {};
                Object.values(this.metadata).forEach(field => {
                    // Only include fields that have keys (valid or not)
                    if (field.key) {
                        flatMetadata[field.key] = field.value;
                    }
                });
                
                const body = {
                    content: this.content,
                    draftId: !this.isEditMode ? this.currentDraftId : null,
                    editPostId: this.isEditMode ? this.editPostId : null,
                    type: this.postType,
                    metadata: flatMetadata,
                    shareTelegram: this.shareTelegram,
                    shareBluesky: this.shareBluesky,
                    status: status
                };
                
                const response = await fetch('/compose/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            
                const result = await response.json();
                
                if (response.ok) {
                    // Edit mode success message
                    if (this.isEditMode && status === 'published') {
                        this.showStatus("Post updated successfully!", "success");
                        
                        // Redirect to the post after a delay
                        setTimeout(() => {
                            window.location.href = `/p/${result.id}`;
                        }, 1500);
                    }
                    // Normal publish mode
                    else if (status === 'published') {
                        this.showStatus("Post published successfully!", "success");
                        
                        // Reset form
                        this.resetForm();
                        
                        // Reload drafts to remove the one that was just published
                        await this.loadDrafts();
                        
                        // Redirect to the post after a delay
                        setTimeout(() => {
                            window.location.href = `/p/${result.id}`;
                        }, 1500);
                    } 
                    // Draft save mode
                    else {
                        this.showStatus("Draft saved successfully!", "success");
                        
                        // Update the current draft ID
                        this.currentDraftId = result.id;
                        
                        // Redirect to compose page to reset the form after a delay
                        setTimeout(() => {
                            window.location.href = '/compose';
                        }, 1500);
                    }
                } else {
                    throw new Error(result.error || `Failed to ${status === 'draft' ? 'save draft' : 'publish post'}`);
                }
            } catch (error) {
                this.showStatus(`Error: ${error.message}`, "error");
            } finally {
                this.submitting = null;
            }
        },
        
        // Reset form fields
        resetForm() {
            // In edit mode, go back to the post
            if (this.isEditMode && this.editPostId) {
                window.location.href = `/p/${this.editPostId}`;
                return;
            }
            
            // For all other cases, redirect to compose to get a fresh state
            window.location.href = '/compose';
        },
        
        // Show status message
        showStatus(message, type = 'success') {
            this.statusMessage = message;
            this.statusType = type;
            
            if (type === 'success') {
                setTimeout(() => {
                    this.statusMessage = '';
                }, 3000);
            }
        }
    };
}
