// public/js/article-compose.js
function articleApp() {
    return {
        title: '',
        content: '',
        showPreview: false,
        submitting: false,
        statusMessage: '',
        statusType: '',
        editMode: false,
        editPostId: null,
        md: null,

        init() {
            // Initialize markdown-it
            this.md = window.markdownit({
                html: false,        // Disable HTML tags in source
                breaks: true,       // Convert '\n' in paragraphs into <br>
                linkify: true,      // Autoconvert URL-like text to links
                typographer: true   // Enable some language-neutral replacement + quotes beautification
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Skip if user is not in our form
                if (!document.activeElement.closest('.compose-container')) {
                    return;
                }
                
                // Ctrl+Enter to publish/update
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.submitArticle();
                }
                
                // Ctrl+P to toggle preview
                if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                    e.preventDefault();
                    this.showPreview = !this.showPreview;
                }
                
                // Escape to cancel edit
                if (e.key === 'Escape' && this.editMode) {
                    e.preventDefault();
                    this.cancelEdit();
                }
            });
        },

        // Initialize with edit data from DOM
        initWithEditData() {
            const dataElement = document.getElementById('edit-article-data');
            if (!dataElement || !dataElement.value) return;

            try {
                const articleData = JSON.parse(dataElement.value);

                // Set edit mode
                this.editMode = true;
                this.editPostId = articleData.id;

                // Set fields
                this.title = articleData.title || '';
                this.content = articleData.content || '';

                console.log('Initialized edit mode for article:', articleData.id);
            } catch (error) {
                console.error('Error initializing edit data:', error);
                this.showStatus('Error loading article data for editing', 'error');
            }
        },

        // Computed property for rendered markdown
        get renderedContent() {
            if (!this.content.trim()) {
                return '<p class="preview-placeholder">Start writing to see preview...</p>';
            }
            
            try {
                return this.md.render(this.content);
            } catch (error) {
                return '<p class="preview-error">Error rendering markdown</p>';
            }
        },

        // Submit article (create or update)
        async submitArticle() {
            if (this.submitting) return;
            
            if (!this.title.trim()) {
                this.showStatus('Title is required', 'error');
                return;
            }
            
            if (!this.content.trim()) {
                this.showStatus('Content is required', 'error');
                return;
            }

            this.submitting = true;

            try {
                const body = {
                    title: this.title.trim(),
                    content: this.content.trim()
                };

                // Add edit post ID if we're editing
                if (this.editMode && this.editPostId) {
                    body.editPostId = this.editPostId;
                }

                const response = await fetch('/article/publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            
                const result = await response.json();
                
                if (response.ok) {
                    const actionText = this.editMode ? "updated" : "published";
                    this.showStatus(`Article ${actionText} successfully!`, "success");
                    
                    // Redirect to the article after a delay
                    setTimeout(() => {
                        window.location.href = `/p/${result.article.id}`;
                    }, 1500);
                } else {
                    throw new Error(result.error || 'Failed to save article');
                }
            } catch (error) {
                this.showStatus(`Error: ${error.message}`, "error");
            } finally {
                this.submitting = false;
            }
        },

        // Cancel edit mode
        cancelEdit() {
            if (this.editMode && this.editPostId) {
                window.location.href = `/p/${this.editPostId}`;
            } else {
                window.location.href = '/';
            }
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
