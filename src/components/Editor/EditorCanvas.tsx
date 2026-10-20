import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Extension, wrappingInputRule } from '@tiptap/core';

import { EditorToolbar } from './EditorToolbar';
import { BubbleMenu } from './BubbleMenu';
import { SearchHighlightExtension } from '../../lib/searchHighlightExtension';
import { EditorFindBar } from './EditorFindBar';

interface EditorCanvasProps {
  initialContent: string;
  onChange: (markdown: string) => void;
  onSave: () => void;
  onClipSelection: (text: string) => void;
  isZenMode: boolean;
  isActive?: boolean;
  tabId?: string;
  onEditorReady?: (editorInstance: unknown) => void;
  searchHighlightQuery?: string;
  isFindBarOpen?: boolean;
  onToggleFindBar?: (open: boolean) => void;
}

// Custom input rule for typing "[] " or "[ ] " to create a task list
const TaskListInputRule = Extension.create({
  name: 'taskListInputRule',
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*(\[ \]|\[\])\s$/,
        type: this.editor.schema.nodes.taskList,
      }),
    ];
  },
});

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  initialContent,
  onChange,
  onSave,
  onClipSelection,
  isZenMode,
  isActive = true,
  tabId,
  onEditorReady,
  searchHighlightQuery,
  isFindBarOpen,
  onToggleFindBar,
}) => {
  const [internalFindBarOpen, setInternalFindBarOpen] = useState(false);
  const isFindOpen = isFindBarOpen !== undefined ? isFindBarOpen : internalFindBarOpen;

  const setFindOpen = useCallback(
    (open: boolean) => {
      if (onToggleFindBar) {
        onToggleFindBar(open);
      } else {
        setInternalFindBarOpen(open);
      }
    },
    [onToggleFindBar]
  );

  const [findBarInitialQuery, setFindBarInitialQuery] = useState('');
  const lastEmittedContentRef = useRef(initialContent);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const isFirstMountRef = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: '-',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TaskListInputRule,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Write your story, technical notes, or draft...',
      }),
      SearchHighlightExtension,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none max-w-none text-[#191b1f] dark:text-[#eceef2]',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      },
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      lastSelectionRef.current = { from, to };
    },
    onUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      lastSelectionRef.current = { from, to };
      const storage = ed.storage as unknown as { markdown?: { getMarkdown: () => string } };
      const md = storage.markdown ? storage.markdown.getMarkdown() : ed.getText();
      lastEmittedContentRef.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Restore cursor position and text selection when tab becomes active
  useEffect(() => {
    if (!editor) return;

    if (isActive) {
      const scrollContainer = document.getElementById(
        tabId ? `editor-scroll-container-${tabId}` : 'editor-scroll-container'
      );
      const savedScrollTop = scrollContainer?.scrollTop;

      if (lastSelectionRef.current) {
        const { from, to } = lastSelectionRef.current;
        const { doc } = editor.state;
        const safeFrom = Math.min(Math.max(0, from), doc.content.size);
        const safeTo = Math.min(Math.max(safeFrom, to), doc.content.size);
        editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
      }

      if (!isFirstMountRef.current) {
        if (editor.view?.dom) {
          editor.view.dom.focus({ preventScroll: true });
        } else {
          editor.commands.focus();
        }

        if (scrollContainer && savedScrollTop !== undefined && scrollContainer.scrollTop !== savedScrollTop) {
          scrollContainer.scrollTop = savedScrollTop;
        }
      }
    }
    isFirstMountRef.current = false;
  }, [isActive, editor, tabId]);

  // Sync editor content if changed externally (e.g. disk reload, force show)
  useEffect(() => {
    if (editor) {
      if (initialContent !== lastEmittedContentRef.current) {
        lastEmittedContentRef.current = initialContent;
        const storage = editor.storage as unknown as { markdown?: { getMarkdown: () => string } };
        const current = storage.markdown ? storage.markdown.getMarkdown() : editor.getText();
        if (initialContent !== current) {
          editor.commands.setContent(initialContent, { emitUpdate: false });
        }
      }
    }
  }, [editor, initialContent]);

  // Sync external search highlight (e.g. from Workspace Search)
  useEffect(() => {
    if (editor) {
      if (searchHighlightQuery) {
        setFindBarInitialQuery(searchHighlightQuery);
        // Highlight matching text without opening the in-document find bar
        editor.commands.setSearchTerm(searchHighlightQuery);
      } else {
        editor.commands.clearSearchTerm();
      }
    }
  }, [editor, searchHighlightQuery]);


  // Global Ctrl+S and Ctrl+F listeners (active tab only)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;

      // Ctrl+S: Save file
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      }
      // Ctrl+F: Open Find Bar in active document
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault();
        if (editor) {
          const { from, to } = editor.state.selection;
          const sel = from !== to ? editor.state.doc.textBetween(from, to) : '';
          if (sel.trim()) {
            setFindBarInitialQuery(sel.trim());
          }
        }
        setFindOpen(true);
      }
    },
    [isActive, onSave, editor, setFindOpen]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f8f7f4] dark:bg-[#111215] transition-colors relative overflow-hidden">
      {/* Top Toolbar is pinned at top, hidden in Zen Mode */}
      {!isZenMode && <EditorToolbar editor={editor} />}

      {/* Floating In-Document Find Bar - Fixed and Sticky at top right (active tab only) */}
      {isActive && (
        <EditorFindBar
          editor={editor}
          isOpen={isFindOpen}
          onClose={() => setFindOpen(false)}
          initialQuery={findBarInitialQuery}
          isZenMode={isZenMode}
        />
      )}

      {/* Scrollable Document Container */}
      <div
        id={tabId ? `editor-scroll-container-${tabId}` : 'editor-scroll-container'}
        className="editor-scroll-container flex-1 flex flex-col min-h-0 overflow-y-auto transition-colors relative"
      >
        {/* Floating Bubble Menu on text selection */}
        <BubbleMenu editor={editor} onClipSelection={onClipSelection} isActive={isActive} />

        {/* Centered Document Canvas (Paper Sheet) */}
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex justify-center">
          <div
            className={`w-full max-w-3xl rounded-lg px-6 sm:px-12 my-2 transition-[background-color,border-color,box-shadow,padding] duration-200 outline-none ${
              isZenMode
                ? 'bg-transparent border border-transparent shadow-none py-6 sm:py-10'
                : 'bg-[#ffffff] dark:bg-[#17191e] border border-[#e5e3dc] dark:border-[#282b33] shadow-xs py-8 sm:py-14'
            }`}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
};
