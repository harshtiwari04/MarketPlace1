import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { IMAGE_MAX_BYTES, IMAGE_MAX_FILES, IMAGE_TYPES } from '../../lib/config';

/**
 * Manages two lists that map straight onto the multipart request:
 *  - `existing` images (from the product) → removing one adds its publicId to `removeImagePublicIds`
 *  - `files` (new File objects) → sent as `images`
 */
export function ImageUploader({ existing = [], removed = [], files = [], onChange, error }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [localErr, setLocalErr] = useState(null);

  const keptExisting = existing.filter((img) => !removed.includes(img.publicId));
  const total = keptExisting.length + files.length;

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const problems = [];
    const accepted = [];
    for (const f of incoming) {
      if (!IMAGE_TYPES.includes(f.type)) { problems.push(`${f.name}: use JPG, PNG or WebP`); continue; }
      if (f.size > IMAGE_MAX_BYTES) { problems.push(`${f.name}: larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB`); continue; }
      accepted.push(f);
    }
    const room = IMAGE_MAX_FILES - total;
    if (accepted.length > room) problems.push(`Only ${room} more image${room === 1 ? '' : 's'} allowed`);
    setLocalErr(problems.length ? problems.join('. ') : null);
    if (accepted.length) onChange({ files: [...files, ...accepted.slice(0, Math.max(0, room))], removed });
  };

  const removeExisting = (publicId, url) => onChange({ files, removed: [...removed, publicId ?? url] });
  const removeNew = (idx) => onChange({ files: files.filter((_, i) => i !== idx), removed });

  return (
    <div className="stack-sm">
      {total > 0 && (
        <div className="thumbs">
          {keptExisting.map((img) => (
            <div key={img.publicId || img.url} className="thumb">
              <img src={img.url} alt="" />
              <span className="thumb-tag">Saved</span>
              <button type="button" onClick={() => removeExisting(img.publicId, img.url)} aria-label="Remove image"><X size={14} /></button>
            </div>
          ))}
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="thumb">
              <img src={URL.createObjectURL(f)} alt="" onLoad={(e) => URL.revokeObjectURL(e.target.src)} />
              <span className="thumb-tag">New</span>
              <button type="button" onClick={() => removeNew(i)} aria-label={`Remove ${f.name}`}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {total < IMAGE_MAX_FILES && (
        <div className={`uploader ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
          <input ref={inputRef} type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}><ImagePlus size={16} /> Add images</button>
          <p className="text-sm" style={{ marginTop: 'var(--s-3)' }}>Drop files here or choose from your device. JPG, PNG or WebP, up to 5 MB each, {IMAGE_MAX_FILES} images max.</p>
        </div>
      )}
      {(localErr || error) && <div className="field-error" role="alert">{localErr || error}</div>}
    </div>
  );
}
