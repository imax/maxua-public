function composeDraftsModule() {
  return {
    drafts: [],
    loadingDrafts: false,
    currentDraftId: null,
    deletingDraft: null,

    async initDrafts() {
      if (this.loadingDrafts || this.isEditMode) return;
      this.loadingDrafts = true;
      try {
        const response = await fetch('/compose/drafts', { credentials: 'include' });
        if (response.ok) {
          this.drafts = await response.json();
        } else {
          console.error('Failed to load drafts');
        }
      } catch (error) {
        console.error('Error loading drafts:', error);
      } finally {
        this.loadingDrafts = false;
      }
    },

    selectDraft(draft) {
      if (this.isEditMode) return;
      this.content = draft.content;
      this.currentDraftId = draft.id;
      this.metadata = {};
      if (draft.metadata && typeof draft.metadata === 'object') {
        Object.entries(draft.metadata).forEach(([key, value]) => {
          const id = Date.now() + Math.random().toString().slice(2, 8);
          this.metadata[id] = { key, value };
        });
        if (draft.metadata.url) {
          this.processedUrls[draft.metadata.url] = 'completed';
        }
      }
      const textarea = document.querySelector('.compose-textarea');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 600) + 'px';
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textarea.focus();
      }
    },

    async deleteDraft(draftId) {
      if (!draftId) return;
      try {
        if (event) {
          event.stopPropagation();
          event.preventDefault();
        }
        if (this.deletingDraft === draftId) return;
        this.deletingDraft = draftId;
        const response = await fetch(`/compose/drafts/${draftId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (response.ok) {
          this.drafts = this.drafts.filter(d => d.id !== draftId);
          this.showStatus('Draft deleted', 'success');
          if (this.currentDraftId === draftId) {
            this.resetForm();
          }
        } else {
          this.showStatus('Failed to delete draft', 'error');
        }
      } catch (error) {
        console.error('Error deleting draft:', error);
        this.showStatus('Error deleting draft', 'error');
      } finally {
        this.deletingDraft = null;
      }
    },
  };
}