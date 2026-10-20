import React, { useState } from 'react';
import { FileTreeNode as TreeNodeType, isMarkdownFile } from '../../types/workspace';
import { ConfirmModal } from '../ConfirmModal';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Trash2,
  Edit2,
  FilePlus,
  FolderPlus,
} from 'lucide-react';

interface FileTreeNodeProps {
  node: TreeNodeType;
  level?: number;
  activeFileId: string | null;
  expandedFolderIds?: Set<string>;
  onToggleExpand?: (folderId: string) => void;
  onExpandFolder?: (folderId: string) => void;
  isSearching?: boolean;
  onSelectFile: (node: TreeNodeType) => void;
  onCreateFileInDir: (dirHandle?: FileSystemDirectoryHandle, dirNativePath?: string) => void;
  onCreateFolderInDir?: (dirHandle?: FileSystemDirectoryHandle, dirNativePath?: string) => void;
  onDeleteNode: (parentHandle?: FileSystemDirectoryHandle, name?: string, node?: TreeNodeType) => void;
  onRenameNode: (
    parentHandle?: FileSystemDirectoryHandle,
    oldName?: string,
    newName?: string,
    kind?: 'file' | 'directory',
    node?: TreeNodeType
  ) => void;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level = 0,
  activeFileId,
  expandedFolderIds,
  onToggleExpand,
  onExpandFolder,
  isSearching = false,
  onSelectFile,
  onCreateFileInDir,
  onCreateFolderInDir,
  onDeleteNode,
  onRenameNode,
}) => {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editName, setEditName] = useState(node.name);

  const isDirectory = node.kind === 'directory';
  const isActive = activeFileId === node.id;
  const isExpanded = isDirectory
    ? isSearching
      ? true
      : expandedFolderIds !== undefined
        ? expandedFolderIds.has(node.id)
        : localExpanded
    : false;

  const handleRowClick = () => {
    if (isDirectory) {
      if (onToggleExpand) {
        onToggleExpand(node.id);
      } else {
        setLocalExpanded(prev => !prev);
      }
    } else {
      onSelectFile(node);
    }
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim() && editName !== node.name) {
      onRenameNode(
        node.parentHandle as FileSystemDirectoryHandle,
        node.name,
        editName.trim(),
        node.kind,
        node
      );
    }
    setIsEditing(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    setIsDeleteConfirmOpen(false);
    onDeleteNode(node.parentHandle as FileSystemDirectoryHandle, node.name, node);
  };

  const handleNewFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      onCreateFileInDir(node.handle as FileSystemDirectoryHandle, node.nativePath);
      if (onExpandFolder) {
        onExpandFolder(node.id);
      } else {
        setLocalExpanded(true);
      }
    }
  };

  const handleNewFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory && onCreateFolderInDir) {
      onCreateFolderInDir(node.handle as FileSystemDirectoryHandle, node.nativePath);
      if (onExpandFolder) {
        onExpandFolder(node.id);
      } else {
        setLocalExpanded(true);
      }
    }
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(node.name);
    setIsEditing(true);
  };

  const isMarkdown = isMarkdownFile(node);

  return (
    <div>
      <div
        onClick={handleRowClick}
        style={{ paddingLeft: `${level * 18 + 8}px` }}
        className={`group relative flex items-center justify-between py-1.5 pr-2 rounded text-xs cursor-pointer select-none transition-colors ${
          isActive
            ? 'bg-[#2d6a4f]/15 text-[#2d6a4f] dark:bg-[#52b788]/20 dark:text-[#52b788] font-medium'
            : 'text-[#191b1f] dark:text-[#eceef2] hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={isDirectory ? isExpanded : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-4 h-4 shrink-0 flex items-center justify-center text-[#59606d] dark:text-[#9ba2b0]">
            {isDirectory && (
              isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )
            )}
          </span>

          {isDirectory ? (
            isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            )
          ) : (
            <FileText
              className={`w-3.5 h-3.5 shrink-0 ${
                isMarkdown
                  ? 'text-[#2d6a4f] dark:text-[#52b788]'
                  : 'text-[#59606d] dark:text-[#9ba2b0]'
              }`}
            />
          )}

          {isEditing ? (
            <form onSubmit={handleRenameSubmit} onClick={e => e.stopPropagation()} className="flex-1 mr-1">
              <input
                type="text"
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                className="w-full px-1.5 py-0.5 text-xs rounded border border-[#2d6a4f] dark:border-[#52b788] bg-transparent text-[#191b1f] dark:text-[#eceef2] focus:outline-none"
              />
            </form>
          ) : (
            <span className="truncate text-xs">{node.name}</span>
          )}
        </div>

        {/* Action icons on hover */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
            {isDirectory && (
              <>
                <button
                  type="button"
                  onClick={handleNewFile}
                  className="p-1 rounded text-[#59606d] dark:text-[#9ba2b0] hover:text-[#191b1f] dark:hover:text-[#eceef2] hover:bg-black/5 dark:hover:bg-white/5"
                  title="New file in this folder"
                  aria-label="New file in this folder"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
                {onCreateFolderInDir && (
                  <button
                    type="button"
                    onClick={handleNewFolder}
                    className="p-1 rounded text-[#59606d] dark:text-[#9ba2b0] hover:text-[#191b1f] dark:hover:text-[#eceef2] hover:bg-black/5 dark:hover:bg-white/5"
                    title="New folder in this folder"
                    aria-label="New folder in this folder"
                  >
                    <FolderPlus className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
            {!isDirectory && (
              <button
                type="button"
                onClick={handleStartRename}
                className="p-1 rounded text-[#59606d] dark:text-[#9ba2b0] hover:text-[#191b1f] dark:hover:text-[#eceef2] hover:bg-black/5 dark:hover:bg-white/5"
                title="Rename file"
                aria-label="Rename file"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={handleDeleteClick}
              className="p-1 rounded text-[#59606d] dark:text-[#9ba2b0] hover:text-red-600 hover:bg-red-500/10"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title={`Delete ${isDirectory ? 'Folder' : 'File'}?`}
        message={`Are you sure you want to delete "${node.name}" from your local disk? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      {/* Recursive children for directory */}
      {isDirectory && isExpanded && node.children && (
        <div role="group">
          {node.children.length > 0 ? (
            node.children.map(child => (
              <FileTreeNode
                key={child.id}
                node={child}
                level={level + 1}
                activeFileId={activeFileId}
                expandedFolderIds={expandedFolderIds}
                onToggleExpand={onToggleExpand}
                onExpandFolder={onExpandFolder}
                isSearching={isSearching}
                onSelectFile={onSelectFile}
                onCreateFileInDir={onCreateFileInDir}
                onCreateFolderInDir={onCreateFolderInDir}
                onDeleteNode={onDeleteNode}
                onRenameNode={onRenameNode}
              />
            ))
          ) : (
            <div
              style={{ paddingLeft: `${(level + 1) * 18 + 30}px` }}
              className="py-1 text-[11px] text-[#59606d] dark:text-[#9ba2b0] italic"
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
};
