import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, X, AlertCircle, Loader2 } from 'lucide-react';

interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWorkspace: (
    name: string,
    initialNoteTitle?: string,
    initialNoteContent?: string
  ) => Promise<FileSystemDirectoryHandle | null>;
}

export const NewWorkspaceModal: React.FC<NewWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreateWorkspace,
}) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [createStarterNote, setCreateStarterNote] = useState(true);
  const [starterNoteName, setStarterNoteName] = useState('Welcome.md');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setWorkspaceName('');
      setCreateStarterNote(true);
      setStarterNoteName('Welcome.md');
      setErrorMessage(null);
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a workspace name.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const noteTitle = createStarterNote ? starterNoteName.trim() || 'Welcome.md' : '';
      const starterContent = createStarterNote
        ? `# ${trimmed}\n\nWelcome to your new Markdown workspace. All notes and edits sync directly to your local drive.\n`
        : undefined;

      const handle = await onCreateWorkspace(trimmed, noteTitle, starterContent);
      if (handle) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to create new workspace:', err);
      setErrorMessage('Could not create workspace. Please check folder permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-workspace-title"
    >
      <div className="bg-[#ffffff] dark:bg-[#17191e] border border-[#e5e3dc] dark:border-[#282b33] rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl text-[#191b1f] dark:text-[#eceef2] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#e5e3dc] dark:border-[#282b33]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#2d6a4f]/10 dark:bg-[#52b788]/15 text-[#2d6a4f] dark:text-[#52b788]">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 id="new-workspace-title" className="font-serif text-lg font-semibold tracking-tight">
                Create New Workspace
              </h2>
              <p className="text-xs text-[#59606d] dark:text-[#9ba2b0]">
                Initialize a new folder on your computer
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded text-[#59606d] dark:text-[#9ba2b0] hover:text-[#191b1f] dark:hover:text-[#eceef2] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2d6a4f] dark:focus-visible:outline-[#52b788]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="workspace-name-input"
              className="block text-xs font-medium text-[#191b1f] dark:text-[#eceef2] mb-1.5"
            >
              Workspace Name
            </label>
            <input
              id="workspace-name-input"
              ref={inputRef}
              type="text"
              required
              disabled={isSubmitting}
              placeholder="e.g. Research Notes, Journal, Project Vault"
              value={workspaceName}
              onChange={e => {
                setWorkspaceName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#e5e3dc] dark:border-[#282b33] bg-[#f8f7f4] dark:bg-[#111215] text-[#191b1f] dark:text-[#eceef2] focus:border-[#2d6a4f] dark:focus:border-[#52b788] focus:outline-none"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#191b1f] dark:text-[#eceef2]">
              <input
                type="checkbox"
                checked={createStarterNote}
                onChange={e => setCreateStarterNote(e.target.checked)}
                disabled={isSubmitting}
                className="w-3.5 h-3.5 rounded border-[#e5e3dc] dark:border-[#282b33] text-[#2d6a4f] focus:ring-[#2d6a4f]"
              />
              <span>Create an initial welcome note</span>
            </label>

            {createStarterNote && (
              <div className="pl-5.5">
                <input
                  type="text"
                  disabled={isSubmitting}
                  placeholder="Welcome.md"
                  value={starterNoteName}
                  onChange={e => setStarterNoteName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-[#e5e3dc] dark:border-[#282b33] bg-[#f8f7f4] dark:bg-[#111215] text-[#191b1f] dark:text-[#eceef2] focus:border-[#2d6a4f] dark:focus:border-[#52b788] focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-[#f8f7f4] dark:bg-[#111215] border border-[#e5e3dc] dark:border-[#282b33] text-xs text-[#59606d] dark:text-[#9ba2b0] leading-relaxed">
            When you click create, select the parent folder on your disk where the workspace directory should live.
          </div>

          {errorMessage && (
            <div className="flex items-center gap-1.5 p-2.5 rounded bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-[#e5e3dc] dark:border-[#282b33] hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2d6a4f] dark:focus-visible:outline-[#52b788]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !workspaceName.trim()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#2d6a4f] hover:bg-[#24553f] dark:bg-[#52b788] dark:hover:bg-[#429d73] text-white dark:text-[#111215] shadow-xs transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2d6a4f] dark:focus-visible:outline-[#52b788]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Workspace...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Choose Location & Create</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
