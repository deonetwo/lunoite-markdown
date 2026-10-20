import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { useTheme } from './hooks/useTheme';
import { useWorkspace } from './hooks/useWorkspace';
import { useTabs } from './hooks/useTabs';
import { useLocalStorage } from './hooks/useLocalStorage';

import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/Editor/TabBar';
import { EditorCanvas } from './components/Editor/EditorCanvas';
import { WorkspaceExplorer } from './components/Sidebar/WorkspaceExplorer';
import { ReferenceShelf } from './components/Shelf/ReferenceShelf';
import { ShortcutsModal } from './components/ShortcutsModal';
import { WelcomeWorkspace } from './components/Workspace/WelcomeWorkspace';
import { WorkspaceSearchModal } from './components/Workspace/WorkspaceSearchModal';
import { NewWorkspaceModal } from './components/Workspace/NewWorkspaceModal';
import { RecentWorkspacesModal } from './components/Workspace/RecentWorkspacesModal';
import { NonMarkdownPreviewNotice } from './components/Editor/NonMarkdownPreviewNotice';
import { scrollToActiveMatch } from './lib/searchHighlightExtension';
import { getTauriCliFile, readNativeFile, writeNativeFile, isTauri, pickNativeFile } from './lib/tauri';

import { computeStats, downloadMarkdownFile } from './lib/markdown';
import { INITIAL_CARDS } from './lib/defaultCards';
import { ReferenceCard } from './types/shelf';
import { DocumentStats, SaveStatus } from './types/editor';
import { FileTreeNode, RecentWorkspace, isMarkdownFile } from './types/workspace';
import { SearchMatch } from './types/search';


export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // Workspace state & operations
  const {
    workspace,
    recentWorkspaces,
    isNativeSupported,
    openWorkspace,
    openRecentWorkspace,
    createNewWorkspace,
    removeRecent,
    clearRecent,
    closeWorkspace,
    refreshTree,
    readFile,
    writeFile,
    createFile,
    createFolder,
    deleteEntry,
    renameEntry,
  } = useWorkspace();

  // Multi-tab document manager
  const {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    openTab,
    closeTab,
    updateTabContent,
    markTabClean,
    closeAllTabs,
    forceShowTab,
  } = useTabs();

  // Reference shelf cards (stored in localStorage)
  const [cards, setCards] = useLocalStorage<ReferenceCard[]>(
    'lunoite_reference_cards',
    INITIAL_CARDS
  );

  // Editor and UI state
  const editorRef = useRef<Editor | null>(null);
  const editorsRef = useRef<Map<string, Editor>>(new Map());
  const saveTimeoutRef = useRef<number | null>(null);

  const [isExplorerOpen, setIsExplorerOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search'>('files');
  const [isShelfOpen, setIsShelfOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isRecentWorkspacesOpen, setIsRecentWorkspacesOpen] = useState<boolean>(false);
  const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState<boolean>(false);
  const [isFindBarOpen, setIsFindBarOpen] = useState<boolean>(false);
  const [editorSearchQuery, setEditorSearchQuery] = useState<string | undefined>(undefined);
  const [clipText, setClipText] = useState<string | undefined>(undefined);
  const [isSavingToDisk, setIsSavingToDisk] = useState<boolean>(false);
  const [isReadingNonMd, setIsReadingNonMd] = useState<boolean>(false);

  // Sync active editor reference when activeTabId changes
  useEffect(() => {
    if (activeTabId) {
      editorRef.current = editorsRef.current.get(activeTabId) || null;
    } else {
      editorRef.current = null;
    }
  }, [activeTabId]);



  // Open single Markdown file from disk (independent of workspace folder)
  const handleOpenSingleFile = useCallback(async () => {
    if (isTauri()) {
      const filePath = await pickNativeFile();
      if (filePath) {
        try {
          const content = await readNativeFile(filePath);
          const fileName = filePath.split(/[\\/]/).pop() || 'document.md';
          const tabId = `native:${filePath}`;
          const node: FileTreeNode = {
            id: tabId,
            name: fileName,
            path: fileName,
            nativePath: filePath,
            kind: 'file',
            extension: fileName.split('.').pop() || 'md',
          };
          openTab(node, content, { nativePath: filePath, isSingleFile: true });
        } catch (err) {
          console.error('Failed to open native file:', err);
        }
      }
      return;
    }

    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handles = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Markdown Files',
              accept: {
                'text/markdown': ['.md', '.markdown'],
                'text/plain': ['.txt'],
              },
            },
          ],
          multiple: true,
        });
        for (const handle of handles) {
          const file = await handle.getFile();
          const content = await file.text();
          const tabId = `single:${file.name}:${Date.now()}`;
          const node: FileTreeNode = {
            id: tabId,
            name: file.name,
            path: file.name,
            kind: 'file',
            handle,
            extension: file.name.split('.').pop() || 'md',
          };
          openTab(node, content, { isSingleFile: true });
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Failed to open file via picker:', err);
      }
    } else {
      // Fallback for browsers without File System Access API
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt,text/plain,text/markdown';
      input.multiple = true;
      input.onchange = async () => {
        if (!input.files) return;
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const content = await file.text();
          const tabId = `single:${file.name}:${Date.now()}`;
          const node: FileTreeNode = {
            id: tabId,
            name: file.name,
            path: file.name,
            kind: 'file',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handle: {} as any,
            extension: file.name.split('.').pop() || 'md',
          };
          openTab(node, content, { isSingleFile: true });
        }
      };
      input.click();
    }
  }, [openTab]);

  // Stats calculation
  const stats: DocumentStats = activeTab
    ? computeStats(activeTab.content)
    : { words: 0, characters: 0, readingTimeMinutes: 0, lines: 0 };

  // Compute SaveStatus
  const saveStatus: SaveStatus = isSavingToDisk
    ? 'saving'
    : activeTab
      ? activeTab.isDirty
        ? 'unsaved'
        : 'saved'
      : 'local_only';

  // Internal helper to read and open file into editor tab
  const doOpenFile = useCallback(
    async (node: FileTreeNode, targetMatch?: SearchMatch, query?: string) => {
      if (node.kind !== 'file') return;
      setIsFindBarOpen(false);

      try {
        const content = node.nativePath
          ? await readNativeFile(node.nativePath)
          : await readFile(node.handle as FileSystemFileHandle, node.nativePath);
        openTab(node, content, { nativePath: node.nativePath });

        const effectiveQuery =
          query ||
          (targetMatch && targetMatch.lineContent
            ? targetMatch.lineContent.slice(
                targetMatch.matchStartIndex,
                targetMatch.matchEndIndex
              )
            : undefined);

        setEditorSearchQuery(effectiveQuery);

        if (effectiveQuery || targetMatch) {
          // Reliably locate match in editor document and scroll directly into viewport center
          const executeJump = () => {
            const editor = editorsRef.current.get(node.id) || editorRef.current;
            if (!editor) return false;

            if (effectiveQuery) {
              editor.commands.jumpToMatch(
                effectiveQuery,
                false,
                targetMatch?.matchIndex,
                targetMatch?.lineContent
              );
            } else if (targetMatch) {
              const doc = editor.state.doc;
              const fullText = doc.textBetween(0, doc.content.size, '\n');
              const lines = fullText.split('\n');
              let offset = 0;
              const lineIdx = Math.max(0, targetMatch.lineNumber - 1);
              for (let i = 0; i < Math.min(lineIdx, lines.length); i++) {
                offset += lines[i].length + 1;
              }
              const matchStart = offset + targetMatch.matchStartIndex;
              const matchEnd = offset + targetMatch.matchEndIndex;
              const safeFrom = Math.min(Math.max(1, matchStart + 1), doc.content.size);
              const safeTo = Math.min(Math.max(safeFrom, matchEnd + 1), doc.content.size);
              editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
            }

            scrollToActiveMatch(10, 40);
            return true;
          };

          const isAlreadyActiveTab = activeTabId === node.id;
          if (isAlreadyActiveTab) {
            // If already in the active document, jump immediately with 0ms delay
            executeJump();
          } else {
            // Fire jump attempts after content has been rendered into the canvas
            setTimeout(executeJump, 40);
            setTimeout(executeJump, 120);
            setTimeout(executeJump, 280);
          }
        }
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [readFile, openTab, activeTabId]
  );

  // Open file from explorer tree or search results
  const handleSelectFile = useCallback(
    async (node: FileTreeNode, targetMatch?: SearchMatch, query?: string) => {
      if (node.kind !== 'file') return;
      setIsFindBarOpen(false);

      const isMd = isMarkdownFile(node);
      const existingTab = tabs.find(t => t.id === node.id);

      if (existingTab) {
        setActiveTabId(node.id);
        const effectiveQuery =
          query ||
          (targetMatch && targetMatch.lineContent
            ? targetMatch.lineContent.slice(
                targetMatch.matchStartIndex,
                targetMatch.matchEndIndex
              )
            : undefined);

        setEditorSearchQuery(effectiveQuery);

        if (existingTab.isForceShown || !existingTab.isNonMarkdown) {
          if (effectiveQuery || targetMatch) {
            const executeJump = () => {
              const editor = editorsRef.current.get(node.id) || editorRef.current;
              if (!editor) return false;

              if (effectiveQuery) {
                editor.commands.jumpToMatch(
                  effectiveQuery,
                  false,
                  targetMatch?.matchIndex,
                  targetMatch?.lineContent
                );
              } else if (targetMatch) {
                const doc = editor.state.doc;
                const fullText = doc.textBetween(0, doc.content.size, '\n');
                const lines = fullText.split('\n');
                let offset = 0;
                const lineIdx = Math.max(0, targetMatch.lineNumber - 1);
                for (let i = 0; i < Math.min(lineIdx, lines.length); i++) {
                  offset += lines[i].length + 1;
                }
                const matchStart = offset + targetMatch.matchStartIndex;
                const matchEnd = offset + targetMatch.matchEndIndex;
                const safeFrom = Math.min(Math.max(1, matchStart + 1), doc.content.size);
                const safeTo = Math.min(Math.max(safeFrom, matchEnd + 1), doc.content.size);
                editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
              }

              scrollToActiveMatch(10, 40);
              return true;
            };

            setTimeout(executeJump, 40);
            setTimeout(executeJump, 120);
          }
        }
        return;
      }


      // If not a Markdown file, open tab without reading content; shows warning inside the preview
      if (!isMd) {
        openTab(node, '', {
          isNonMarkdown: true,
          isForceShown: false,
        });
        return;
      }

      // For Markdown files, read and open directly
      await doOpenFile(node, targetMatch, query);
    },
    [tabs, openTab, setActiveTabId, doOpenFile]
  );

  // User clicked "Force Show Contents" inside the in-preview warning notice
  const handleForceShowTab = useCallback(
    async (tabId: string) => {
      const targetTab = tabs.find(t => t.id === tabId);
      if (!targetTab) return;
      setIsReadingNonMd(true);
      try {
        let content = '';
        if (targetTab.nativePath) {
          content = await readNativeFile(targetTab.nativePath);
        } else if (targetTab.handle) {
          content = await readFile(targetTab.handle);
        }
        forceShowTab(targetTab.id, content);
      } catch (err) {
        console.error('Failed to read non-markdown file:', err);
        alert(`Could not read ${targetTab.name}: ${(err as Error).message}`);
      } finally {
        setIsReadingNonMd(false);
      }
    },
    [tabs, readFile, forceShowTab]
  );

  // Close tab and clean up editor reference
  const handleCloseTab = useCallback(
    (tabId: string) => {
      editorsRef.current.delete(tabId);
      closeTab(tabId);
    },
    [closeTab]
  );

  // Close all tabs and clear all editor references
  const handleCloseAllTabs = useCallback(() => {
    editorsRef.current.clear();
    editorRef.current = null;
    closeAllTabs();
  }, [closeAllTabs]);

  // Save current active tab directly to disk
  const handleSaveActiveTab = useCallback(async () => {
    if (!activeTab) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (activeTab.nativePath) {
      setIsSavingToDisk(true);
      try {
        await writeNativeFile(activeTab.nativePath, activeTab.content);
        markTabClean(activeTab.id);
      } catch (err) {
        console.error('Failed to save native file:', err);
      } finally {
        setIsSavingToDisk(false);
      }
    } else if (activeTab.handle && typeof activeTab.handle.createWritable === 'function') {
      setIsSavingToDisk(true);
      const success = await writeFile(activeTab.handle, activeTab.content);
      setIsSavingToDisk(false);
      if (success) {
        markTabClean(activeTab.id);
      }
    } else {
      downloadMarkdownFile(activeTab.name, activeTab.content);
      markTabClean(activeTab.id);
    }
  }, [activeTab, writeFile, markTabClean]);

  // Handle editor updates per tab with debounced direct disk auto-sync
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const handleTabContentChange = useCallback(
    (tabId: string, newMarkdown: string) => {
      updateTabContent(tabId, newMarkdown);

      const targetTab = tabsRef.current.find(t => t.id === tabId);
      if (!targetTab) return;

      if (targetTab.nativePath) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
          setIsSavingToDisk(true);
          try {
            await writeNativeFile(targetTab.nativePath!, newMarkdown);
            markTabClean(tabId);
          } catch (err) {
            console.error('Failed to auto-save native file:', err);
          } finally {
            setIsSavingToDisk(false);
          }
        }, 800);
      } else if (targetTab.handle && typeof targetTab.handle.createWritable === 'function') {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
          setIsSavingToDisk(true);
          const success = await writeFile(targetTab.handle!, newMarkdown);
          setIsSavingToDisk(false);
          if (success) {
            markTabClean(tabId);
          }
        }, 800);
      }
    },
    [updateTabContent, writeFile, markTabClean]
  );

  // Create new file
  const handleCreateFile = useCallback(
    async (parentHandle?: FileSystemDirectoryHandle, name?: string, parentNativePath?: string) => {
      if (!name) return;
      const res = await createFile(parentHandle, name, undefined, parentNativePath);
      if (res) {
        const cleanName = name.includes('.') ? name : `${name}.md`;
        const initialText = '# Untitled\n\nStart writing...\n';
        const dummyNode: FileTreeNode = {
          id: res.nativePath ? `native:${res.nativePath}` : cleanName,
          name: cleanName,
          path: cleanName,
          nativePath: res.nativePath,
          parentNativePath,
          kind: 'file',
          handle: res.handle,
          parentHandle,
          extension: 'md',
        };
        openTab(dummyNode, initialText, { nativePath: res.nativePath });
      }
    },
    [createFile, openTab]
  );

  // Create new folder
  const handleCreateFolder = useCallback(
    async (parentHandle?: FileSystemDirectoryHandle, name?: string, parentNativePath?: string) => {
      if (!name) return;
      await createFolder(parentHandle, name, parentNativePath);
    },
    [createFolder]
  );

  // Delete node
  const handleDeleteNode = useCallback(
    async (parentHandle?: FileSystemDirectoryHandle, name?: string, node?: FileTreeNode) => {
      if (!name && !node) return;
      const targetName = name || node?.name;
      const targetTab = tabs.find(t => t.name === targetName || (node && t.id === node.id));
      if (targetTab) {
        handleCloseTab(targetTab.id);
      }
      await deleteEntry(parentHandle, name, node);
    },
    [tabs, handleCloseTab, deleteEntry]
  );

  // Rename node
  const handleRenameNode = useCallback(
    async (
      parentHandle?: FileSystemDirectoryHandle,
      oldName?: string,
      newName?: string,
      kind: 'file' | 'directory' = 'file',
      node?: FileTreeNode
    ) => {
      if (!oldName || !newName) return;
      await renameEntry(parentHandle, oldName, newName, kind, node);
    },
    [renameEntry]
  );

  // Export current file
  const handleExport = useCallback(() => {
    if (activeTab) {
      downloadMarkdownFile(activeTab.name, activeTab.content);
    }
  }, [activeTab]);

  // Reference Shelf operations
  const handleInsertCard = useCallback((content: string) => {
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(`\n${content}\n`).run();
    }
  }, []);

  const handleClipSelection = useCallback((text: string) => {
    setClipText(text);
    setIsShelfOpen(true);
  }, []);

  const handleAddCard = useCallback(
    (cardData: Omit<ReferenceCard, 'id' | 'createdAt' | 'updatedAt'>) => {
      const newCard: ReferenceCard = {
        ...cardData,
        id: `card-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setCards(prev => [newCard, ...prev]);
    },
    [setCards]
  );

  const handleUpdateCard = useCallback(
    (id: string, cardData: Omit<ReferenceCard, 'id' | 'createdAt' | 'updatedAt'>) => {
      setCards(prev =>
        prev.map(c =>
          c.id === id ? { ...c, ...cardData, updatedAt: Date.now() } : c
        )
      );
    },
    [setCards]
  );

  const handleDeleteCard = useCallback(
    (id: string) => {
      setCards(prev => prev.filter(c => c.id !== id));
    },
    [setCards]
  );

  // Scratchpad fallback (when user wants to write without opening a folder)
  const handleOpenScratchpad = useCallback(() => {
    const dummyNode: FileTreeNode = {
      id: 'scratchpad.md',
      name: 'scratchpad.md',
      path: 'scratchpad.md',
      kind: 'file',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle: {} as any,
      extension: 'md',
    };
    openTab(
      dummyNode,
      '# Quick Scratchpad\n\nStart writing notes without opening a folder...\n'
    );
  }, [openTab]);

  // Workspace Switch and Creation Handlers
  const handleOpenWorkspace = useCallback(async () => {
    handleCloseAllTabs();
    await openWorkspace();
  }, [handleCloseAllTabs, openWorkspace]);

  const handleSelectRecentWorkspace = useCallback(
    async (recent: RecentWorkspace) => {
      handleCloseAllTabs();
      await openRecentWorkspace(recent);
    },
    [handleCloseAllTabs, openRecentWorkspace]
  );

  const handleCreateWorkspace = useCallback(
    async (
      name: string,
      initialNoteTitle?: string,
      initialNoteContent?: string
    ): Promise<FileSystemDirectoryHandle | null> => {
      handleCloseAllTabs();
      const handle = await createNewWorkspace(
        name,
        initialNoteTitle,
        initialNoteContent
      );
      if (handle && initialNoteTitle) {
        try {
          const cleanName = initialNoteTitle.trim().endsWith('.md')
            ? initialNoteTitle.trim()
            : `${initialNoteTitle.trim()}.md`;
          const fileHandle = await handle.getFileHandle(cleanName);
          const content = await readFile(fileHandle);
          const node: FileTreeNode = {
            id: cleanName,
            name: cleanName,
            path: cleanName,
            kind: 'file',
            handle: fileHandle,
            parentHandle: handle,
            extension: 'md',
          };
          openTab(node, content);
        } catch (err) {
          console.warn('Could not automatically open starter note:', err);
        }
      }
      return handle;
    },
    [handleCloseAllTabs, createNewWorkspace, readFile, openTab]
  );

  const handleCloseWorkspace = useCallback(async () => {
    handleCloseAllTabs();
    await closeWorkspace();
  }, [handleCloseAllTabs, closeWorkspace]);

  // Startup: Check if opened via CLI in Tauri desktop mode
  useEffect(() => {
    async function checkCliFile() {
      const cliPath = await getTauriCliFile();
      if (cliPath) {
        try {
          const content = await readNativeFile(cliPath);
          const fileName = cliPath.split(/[\\/]/).pop() || 'document.md';
          const tabId = `native:${cliPath}`;
          const node: FileTreeNode = {
            id: tabId,
            name: fileName,
            path: fileName,
            kind: 'file',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handle: {} as any,
            extension: fileName.split('.').pop() || 'md',
          };
          openTab(node, content, { nativePath: cliPath, isSingleFile: true });
        } catch (err) {
          console.error('Failed to open CLI file:', err);
        }
      }
    }
    checkCliFile();
  }, [openTab]);

  // Startup: Chromium PWA File Handling API (launchQueue)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('launchQueue' in window && (window as any).LaunchParams && 'files' in (window as any).LaunchParams.prototype) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams.files || !launchParams.files.length) return;
        for (const handle of launchParams.files) {
          if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            const tabId = `single:${file.name}:${Date.now()}`;
            const node: FileTreeNode = {
              id: tabId,
              name: file.name,
              path: file.name,
              kind: 'file',
              handle,
              extension: file.name.split('.').pop() || 'md',
            };
            openTab(node, content, { isSingleFile: true });
          }
        }
      });
    }
  }, [openTab]);

  // Window Drag & Drop support for single Markdown files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            // Try to acquire direct read/write FileSystemHandle if supported
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof (item as any).getAsFileSystemHandle === 'function') {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const handle = await (item as any).getAsFileSystemHandle();
                if (handle && handle.kind === 'file') {
                  const file = await handle.getFile();
                  if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
                    const content = await file.text();
                    const tabId = `single:${file.name}:${Date.now()}`;
                    const node: FileTreeNode = {
                      id: tabId,
                      name: file.name,
                      path: file.name,
                      kind: 'file',
                      handle,
                      extension: file.name.split('.').pop() || 'md',
                    };
                    openTab(node, content, { isSingleFile: true });
                    continue;
                  }
                }
              } catch (err) {
                console.warn('Could not read dropped file handle:', err);
              }
            }

            // Fallback standard File
            const file = item.getAsFile();
            if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt'))) {
              const content = await file.text();
              const tabId = `single:${file.name}:${Date.now()}`;
              const node: FileTreeNode = {
                id: tabId,
                name: file.name,
                path: file.name,
                kind: 'file',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handle: {} as any,
                extension: file.name.split('.').pop() || 'md',
              };
              openTab(node, content, { isSingleFile: true });
            }
          }
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [openTab]);

  // Global application shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Ctrl+O: Open single file
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenSingleFile();
      }
      // Ctrl+Alt+O: Open workspace folder
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenWorkspace();
      }
      // Ctrl+Shift+O: Open workspace history
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsRecentWorkspacesOpen(true);
      }
      // Ctrl+Alt+N: Create new workspace
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewWorkspaceOpen(true);
      }
      // Ctrl+Shift+F: Search workspace text
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFindBarOpen(false);
        setIsSearchModalOpen(true);
      }
      // Alt+E: Toggle explorer
      if (e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsExplorerOpen(prev => {
          const next = !prev;
          if (next && sidebarTab === 'search') {
            setIsFindBarOpen(false);
          }
          return next;
        });
      }
      // Alt+S: Toggle Reference Shelf
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsShelfOpen(prev => !prev);
      }
      // Alt+Z: Toggle Zen mode
      if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setIsZenMode(prev => !prev);
      }
      // Esc: Exit Zen mode
      if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [handleOpenSingleFile, handleOpenWorkspace, isZenMode, sidebarTab]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f8f7f4] dark:bg-[#111215] text-[#191b1f] dark:text-[#eceef2] font-sans antialiased transition-colors duration-200">
      {/* Top Header Bar */}
      <Header
        workspaceName={workspace.name || undefined}
        fileName={activeTab ? activeTab.name : 'No file open'}
        onRename={newName => {
          if (activeTab && activeTab.parentDirHandle) {
            handleRenameNode(
              activeTab.parentDirHandle,
              activeTab.name,
              newName,
              'file'
            );
          }
        }}
        saveStatus={saveStatus}
        onOpenFile={handleOpenSingleFile}
        onOpenWorkspace={handleOpenWorkspace}
        onCreateNewWorkspace={() => setIsNewWorkspaceOpen(true)}
        onOpenRecentWorkspaces={() => setIsRecentWorkspacesOpen(true)}
        onNewFile={() => {
          if (workspace.rootHandle) {
            handleCreateFile(workspace.rootHandle, 'untitled.md');
          } else {
            handleOpenScratchpad();
          }
        }}
        onSaveFile={handleSaveActiveTab}
        onExportFile={handleExport}
        onOpenSearch={() => {
          setIsFindBarOpen(false);
          setIsSearchModalOpen(true);
        }}
        isExplorerOpen={isExplorerOpen}
        onToggleExplorer={() =>
          setIsExplorerOpen(prev => {
            const next = !prev;
            if (next && sidebarTab === 'search') {
              setIsFindBarOpen(false);
            }
            return next;
          })
        }
        isZenMode={isZenMode}
        onToggleZenMode={() => setIsZenMode(prev => !prev)}
        isShelfOpen={isShelfOpen}
        onToggleShelf={() => setIsShelfOpen(prev => !prev)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        hasFileHandle={activeTab !== null && (activeTab.handle !== undefined || activeTab.nativePath !== undefined)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left: Workspace Explorer Sidebar (hidden in Zen mode) */}
        {!isZenMode && (
          <WorkspaceExplorer
            isOpen={isExplorerOpen}
            onClose={() => setIsExplorerOpen(false)}
            workspace={workspace}
            activeFileId={activeTabId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onDeleteNode={handleDeleteNode}
            onRenameNode={handleRenameNode}
            onRefresh={refreshTree}
            onCloseWorkspace={handleCloseWorkspace}
            readFile={readFile}
            openTabs={tabs}
            activeSidebarTab={sidebarTab}
            onTabChange={tab => {
              setSidebarTab(tab);
              if (tab === 'search') {
                setIsFindBarOpen(false);
              }
            }}
          />
        )}

        {/* Center: Tabs + WYSIWYG Editor Canvas */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f8f7f4] dark:bg-[#111215]">
          {/* Multi-document TabBar (hidden in Zen mode) */}
          {!isZenMode && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={tabId => {
                setActiveTabId(tabId);
                setEditorSearchQuery(undefined);
              }}
              onCloseTab={handleCloseTab}
            />
          )}

          {tabs.length > 0 ? (
            <div className="flex-1 min-h-0 min-w-0 relative">
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={`h-full w-full flex flex-col ${
                      isActive
                        ? ''
                        : 'absolute inset-0 invisible pointer-events-none -z-10'
                    }`}
                    aria-hidden={!isActive}
                  >
                    {tab.isNonMarkdown && !tab.isForceShown ? (
                      <NonMarkdownPreviewNotice
                        fileName={tab.name}
                        extension={tab.name.split('.').pop()}
                        onForceShow={() => handleForceShowTab(tab.id)}
                        isLoading={isReadingNonMd}
                      />
                    ) : (
                      <EditorCanvas
                        initialContent={tab.content}
                        isActive={isActive}
                        tabId={tab.id}
                        onChange={markdown => handleTabContentChange(tab.id, markdown)}
                        onSave={handleSaveActiveTab}
                        onClipSelection={handleClipSelection}
                        isZenMode={isZenMode}
                        onEditorReady={ed => {
                          editorsRef.current.set(tab.id, ed as Editor);
                          if (tab.id === activeTabId) {
                            editorRef.current = ed as Editor;
                          }
                        }}
                        searchHighlightQuery={isActive ? editorSearchQuery : undefined}
                        isFindBarOpen={isActive ? isFindBarOpen : false}
                        onToggleFindBar={open => {
                          setIsFindBarOpen(open);
                          if (open) {
                            setSidebarTab('files');
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : workspace.rootHandle || workspace.nativePath ? (


            <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-[#59606d] dark:text-[#9ba2b0]">
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#191b1f] dark:text-[#eceef2]">
                  No document currently open
                </p>
                <p>Select a file from the explorer on the left, or click &quot;+ File&quot; to begin writing.</p>
              </div>
            </div>
          ) : (
            <WelcomeWorkspace
              onOpenFile={handleOpenSingleFile}
              onOpenWorkspace={handleOpenWorkspace}
              onCreateWorkspace={() => setIsNewWorkspaceOpen(true)}
              onOpenScratchpad={handleOpenScratchpad}
              isNativeSupported={isNativeSupported}
              recentWorkspaces={recentWorkspaces}
              onSelectRecent={handleSelectRecentWorkspace}
              onRemoveRecent={removeRecent}
            />
          )}
        </main>

        {/* Right: Collapsible Lateral Reference Shelf */}
        <ReferenceShelf
          isOpen={isShelfOpen}
          onClose={() => setIsShelfOpen(false)}
          cards={cards}
          onInsertCard={handleInsertCard}
          onAddCard={handleAddCard}
          onUpdateCard={handleUpdateCard}
          onDeleteCard={handleDeleteCard}
          clipText={clipText}
          onClearClipText={() => setClipText(undefined)}
        />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        stats={stats}
        fileName={activeTab ? activeTab.name : 'No file'}
        filePath={activeTab ? activeTab.path : undefined}
        workspaceName={workspace.name || undefined}
        hasFileHandle={activeTab !== null && (activeTab.handle !== undefined || activeTab.nativePath !== undefined)}
        isZenMode={isZenMode}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Global Workspace Text Search Modal */}
      <WorkspaceSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        tree={workspace.tree}
        readFile={readFile}
        openTabs={tabs}
        onSelectMatch={handleSelectFile}
        workspaceName={workspace.name || undefined}
      />

      {/* Create New Workspace Modal */}
      <NewWorkspaceModal
        isOpen={isNewWorkspaceOpen}
        onClose={() => setIsNewWorkspaceOpen(false)}
        onCreateWorkspace={handleCreateWorkspace}
      />

      {/* Workspace History / Recent Workspaces Modal */}
      <RecentWorkspacesModal
        isOpen={isRecentWorkspacesOpen}
        onClose={() => setIsRecentWorkspacesOpen(false)}
        recentWorkspaces={recentWorkspaces}
        activeWorkspaceName={workspace.name || undefined}
        onSelectRecent={handleSelectRecentWorkspace}
        onRemoveRecent={removeRecent}
        onClearAllRecent={clearRecent}
        onOpenOtherWorkspace={handleOpenWorkspace}
        onCreateNewWorkspace={() => setIsNewWorkspaceOpen(true)}
      />
    </div>
  );
};



export default App;
