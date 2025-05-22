// public/js/article-compose.js
function articleApp() {
    return {
        title: '',
        content: '',
        showPreview: false,
        submitting: false,
        statusMessage: '',
        statusType: '',
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
                
                // Ctrl+Enter to publish
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.submitArticle();
                }
                
                // Ctrl+P to toggle preview
                if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                    e.preventDefault();
                    this.showPreview = !this.showPreview;
                }
            });
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

        // Submit article
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
                const response = await fetch('/article/publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        title: this.title.trim(),
                        content: this.content.trim()
                    })
                });
            
                const result = await response.json();
                
                if (response.ok) {
                    this.showStatus("Article published successfully!", "success");
                    
                    // Redirect to the article after a delay
                    setTimeout(() => {
                        window.location.href = `/p/${result.article.id}`;
                    }, 1500);
                } else {
                    throw new Error(result.error || 'Failed to publish article');
                }
            } catch (error) {
                this.showStatus(`Error: ${error.message}`, "error");
            } finally {
                this.submitting = false;
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
