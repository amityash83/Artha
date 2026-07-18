import React, { useEffect, useState } from 'react';
import { Upload, Download, Trash2, FileText } from 'lucide-react';
import { AttachedDocument } from '../types';
import { API_BASE_URL } from '../config';

interface DocumentsEditorProps {
  entityType: 'accounts' | 'assets' | 'liabilities' | 'goals';
  entityId: number;
}

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentsEditor: React.FC<DocumentsEditorProps> = ({ entityType, entityId }) => {
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchDocuments = () => {
    fetch(`${API_BASE_URL}/api/entities/${entityType}/${entityId}/documents`)
      .then((r) => r.json())
      .then(setDocuments)
      .catch(() => setDocuments([]));
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      await fetch(`${API_BASE_URL}/api/entities/${entityType}/${entityId}/documents`, {
        method: 'POST',
        body: formData,
      });
      fetchDocuments();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`${API_BASE_URL}/api/documents/${id}`, { method: 'DELETE' });
      fetchDocuments();
    } finally {
      setDeletingId(null);
    }
  };

  const inputId = `document-upload-${entityType}-${entityId}`;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Attached Documents</label>
        <input
          type="file"
          id={inputId}
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
        <label
          htmlFor={inputId}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px', cursor: 'pointer' }}
        >
          <Upload size={12} /> {uploading ? 'Uploading...' : 'Attach File'}
        </label>
      </div>

      {documents.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No documents attached yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <FileText size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatSize(doc.size_bytes)}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <a
                  href={`${API_BASE_URL}/api/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                >
                  <Download size={13} style={{ color: 'var(--info)' }} />
                </a>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                  disabled={deletingId === doc.id}
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 size={13} style={{ color: '#ef4444' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
