import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import logoUrl from './logo.png'

// ── Types ──────────────────────────────────────────────────────────────────

type Product    = 'Jira' | 'Confluence' | 'Both' | 'Unsure'
type Deployment = 'Cloud' | 'Data Center' | 'Unsure'
type Screen     = 'platform' | 'problem' | 'results'
type Role =
  | 'Sales'
  | 'Customer Success Manager'
  | 'Solution Engineer'
  | 'Administrator'
  | 'Technical User'
  | 'Product Manager'
  | 'Marketing'
  | 'Channel Partner'
  | 'Support Engineer'
  | 'Executive / Decision Maker'

interface Message  { role: 'user' | 'assistant'; content: string }
interface Artifact { id: string; lang: string; code: string; label: string; msgIndex: number }

const ROLES: Role[] = [
  'Sales','Customer Success Manager','Solution Engineer','Administrator',
  'Technical User','Product Manager','Marketing','Channel Partner',
  'Support Engineer','Executive / Decision Maker',
]

const LOADING_PHRASES = [
  'Ada is reading the brief…','Ada is searching product knowledge…',
  'Ada is checking deployment compatibility…','Ada is matching to Adaptavist products…',
  'Ada is weighing up the options…','Ada is preparing a recommendation…',
  'Ada is thinking this through…','Ada is consulting the docs…',
]

const CODE_LANGS = new Set(['groovy','javascript','js','typescript','ts','python','py','java','kotlin','kt','sql','bash','sh','xml','json','yaml','yml','css','html','ruby','rb','go','rust','c','cpp','csharp','cs','scala','php','swift','r'])
const DOC_TYPES  = new Set(['document','doc','brief','onepager','one-pager','summary'])
const LANG_EXT: Record<string,string> = {groovy:'groovy',javascript:'js',js:'js',typescript:'ts',ts:'ts',python:'py',py:'py',sql:'sql',java:'java',kotlin:'kt',kt:'kt',bash:'sh',sh:'sh',markdown:'md',md:'md',xml:'xml',json:'json',yaml:'yml',yml:'yml',css:'css',html:'html',ruby:'rb',rb:'rb'}
const LANG_LABEL: Record<string,string> = {groovy:'Groovy Script',javascript:'JavaScript',js:'JavaScript',typescript:'TypeScript',ts:'TypeScript',python:'Python Script',py:'Python Script',sql:'SQL Query',java:'Java',kotlin:'Kotlin',bash:'Shell Script',sh:'Shell Script',markdown:'Guide',md:'Guide',xml:'XML',json:'JSON',yaml:'YAML',yml:'YAML'}

function inferTitle(lang: string, code: string): string {
  const m = code.match(/Purpose:\s*([^\n*]+)/)
  if (m) return m[1].replace(/[*]/g,'').trim()
  return LANG_LABEL[lang.toLowerCase()] || 'Script'
}
function langExt(lang: string): string { return LANG_EXT[lang.toLowerCase()] || 'txt' }
function isCode(lang: string): boolean { return CODE_LANGS.has(lang.toLowerCase()) }
function isDoc(lang: string):  boolean { return DOC_TYPES.has(lang.toLowerCase()) }

function parseMessage(content: string): { prose: string; options: string[] } {
  const options: string[] = []
  const prose = content
    .replace(/\[\[(.+?)\]\]/g, (_, o) => { options.push(o.trim()); return '' })
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n').trim()
  return { prose, options }
}

function extractArtifacts(content: string, msgIndex: number): Artifact[] {
  const results: Artifact[] = []; const re = /```(\w*)\n?([\s\S]*?)```/g; let match, bi = 0
  while ((match = re.exec(content)) !== null) {
    const lang = match[1] || 'text'; const code = match[2].trim()
    if (code.split('\n').length < 5) continue
    results.push({ id: `${msgIndex}-${bi}`, lang, code, label: inferTitle(lang, code), msgIndex }); bi++
  }
  return results
}

// ── Markdown renderer ──────────────────────────────────────────────────────

function inlineFmt(raw: string): string {
  let s = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  s = s.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
  s = s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g,'<em>$1</em>')
  s = s.replace(/__(.+?)__/g,'<strong>$1</strong>')
  s = s.replace(/_([^_\n]+?)_/g,'<em>$1</em>')
  s = s.replace(/`([^`]+)`/g,'<code>$1</code>')
  s = s.replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
  return s
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0

  function nextNonBlankMatches(from: number, pattern: RegExp): boolean {
    let j = from
    while (j < lines.length && lines[j].trim() === '') j++
    return j < lines.length && pattern.test(lines[j].trim())
  }

  while (i < lines.length) {
    const t = lines[i].trim()

    if (t === '') { i++; continue }

    if (/^### /.test(t)) { out.push(`<h3>${inlineFmt(t.slice(4))}</h3>`); i++; continue }
    if (/^## /.test(t))  { out.push(`<h2>${inlineFmt(t.slice(3))}</h2>`); i++; continue }
    if (/^# /.test(t))   { out.push(`<h1>${inlineFmt(t.slice(2))}</h1>`); i++; continue }

    if (/^[-*]{3,}$/.test(t)) { out.push('<hr/>'); i++; continue }

    if (/^> /.test(t)) { out.push(`<blockquote>${inlineFmt(t.slice(2))}</blockquote>`); i++; continue }

    if (/^[-*•] /.test(t)) {
      const items: string[] = []
      while (i < lines.length) {
        const line = lines[i].trim()
        if (line === '') {
          if (nextNonBlankMatches(i + 1, /^[-*•] /)) { i++; continue }
          break
        }
        if (!/^[-*•] /.test(line)) break
        items.push(`<li>${inlineFmt(line.replace(/^[-*•] /, ''))}</li>`)
        i++
      }
      if (items.length) out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+[.)]\s/.test(t)) {
      const items: string[] = []
      while (i < lines.length) {
        const line = lines[i].trim()
        if (line === '') {
          if (nextNonBlankMatches(i + 1, /^\d+[.)]\s/)) { i++; continue }
          break
        }
        if (!/^\d+[.)]\s/.test(line)) break
        items.push(`<li>${inlineFmt(line.replace(/^\d+[.)]\s/, ''))}</li>`)
        i++
      }
      if (items.length) out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (/^\|/.test(t)) {
      const tbl: string[] = []
      while (i < lines.length && /^\|/.test(lines[i].trim())) { tbl.push(lines[i].trim()); i++ }
      if (tbl.length >= 2) {
        const hcells = tbl[0].split('|').filter(c => c.trim())
        const rows   = tbl.slice(2)
        const thead  = `<thead><tr>${hcells.map(c=>`<th>${inlineFmt(c.trim())}</th>`).join('')}</tr></thead>`
        const tbody  = rows.map(r=>`<tr>${r.split('|').filter(c=>c.trim()).map(c=>`<td>${inlineFmt(c.trim())}</td>`).join('')}</tr>`).join('')
        out.push(`<table>${thead}<tbody>${tbody}</tbody></table>`)
      }
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3} /.test(lines[i].trim()) &&
      !/^[-*•] /.test(lines[i].trim()) &&
      !/^\d+[.)]\s/.test(lines[i].trim()) &&
      !/^[-*]{3,}$/.test(lines[i].trim()) &&
      !/^\|/.test(lines[i].trim()) &&
      !/^> /.test(lines[i].trim())
    ) { para.push(lines[i]); i++ }

    if (para.length) out.push(`<p>${para.map(l => inlineFmt(l)).join('<br/>')}</p>`)
  }

  return out.join('\n')
}

// ── Logo ───────────────────────────────────────────────────────────────────

function TagLogo({ size = 36 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt="Adaptavist"
      style={{
        width:  size,
        height: size,
        objectFit: 'contain',
        flexShrink: 0,
        display: 'block',
        borderRadius: 6,
      }}
    />
  )
}

function LoadingMessage() {
  const [idx, setIdx] = useState(0)
  useEffect(() => { const t = setInterval(() => setIdx(i => (i+1) % LOADING_PHRASES.length), 2200); return () => clearInterval(t) }, [])
  return (
    <div className="loading-msg">
      <span className="loading-text">{LOADING_PHRASES[idx]}</span>
      <span className="dot" style={{animationDelay:'0ms'}}/><span className="dot" style={{animationDelay:'150ms'}}/><span className="dot" style={{animationDelay:'300ms'}}/>
    </div>
  )
}

// ── Shared UI ──────────────────────────────────────────────────────────────

function BadgeDropdown({ value, options, onChange, className }: {
  value: string; options: string[]; onChange: (v: string) => void; className: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="badge-dropdown-wrapper" ref={ref}>
      <button className={`badge ${className} badge-clickable`} onClick={() => setOpen(v => !v)}>
        {value}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{marginLeft:'3px',opacity:.7}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="badge-dropdown">
          {options.map(opt => (
            <button key={opt}
              className={`badge-dropdown-item ${opt === value ? 'badge-dropdown-item-active' : ''}`}
              onClick={() => { onChange(opt); setOpen(false) }}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlatformBadge({ product, deployment, role, onChangeProduct, onChangeDeployment, onChangeRole }: {
  product: Product; deployment: Deployment; role?: Role | null
  onChangeProduct?: (v: Product) => void
  onChangeDeployment?: (v: Deployment) => void
  onChangeRole?: (v: Role) => void
}) {
  const products:    Product[]    = ['Jira','Confluence','Both','Unsure']
  const deployments: Deployment[] = ['Cloud','Data Center','Unsure']

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {onChangeProduct
        ? <BadgeDropdown value={product} options={products} onChange={v => onChangeProduct(v as Product)} className="badge-product"/>
        : <span className="badge badge-product">{product}</span>
      }
      {onChangeDeployment
        ? <BadgeDropdown value={deployment} options={deployments} onChange={v => onChangeDeployment(v as Deployment)} className="badge-deploy"/>
        : <span className="badge badge-deploy">{deployment}</span>
      }
      {role && (onChangeRole
        ? <BadgeDropdown value={role} options={ROLES} onChange={v => onChangeRole(v as Role)} className="badge-role"/>
        : <span className="badge badge-role">{role}</span>
      )}
    </div>
  )
}

function AdaAvatar() {
  return (
    <div className="ada-avatar" title="Ada">
      <img src={logoUrl} alt="Ada" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }}/>
    </div>
  )
}

function SelectionCard({ label, description, selected, onClick }: { label: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`selection-card ${selected ? 'selection-card-selected' : ''}`}>
      <span className="selection-card-label">{label}</span>
      <span className="selection-card-desc">{description}</span>
    </button>
  )
}

function AdaMessage({ content, isLast, isLoading, hasArtifact, onOption, onOpenArtifact }: { content: string; isLast: boolean; isLoading: boolean; hasArtifact: boolean; onOption: (o: string) => void; onOpenArtifact: () => void }) {
  const { prose, options } = parseMessage(content)
  return (
    <div className="msg-bubble msg-bubble-ada">
      <div className="prose-ada" dangerouslySetInnerHTML={{ __html: renderMarkdown(prose) }}/>
      {hasArtifact && (
        <div className="artifact-notice" onClick={onOpenArtifact} style={{ cursor: 'pointer' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Script ready — view in panel →
        </div>
      )}
      {options.length > 0 && (
        <div className="option-row">
          {options.map((opt, i) =>
            isLast && !isLoading
              ? <button key={i} className="option-btn" onClick={() => onOption(opt)}>{opt}</button>
              : <span   key={i} className="option-btn option-btn-used">{opt}</span>
          )}
        </div>
      )}
    </div>
  )
}

function CodeWithLineNumbers({ code }: { code: string }) {
  const lines = code.split('\n')
  return (
    <div className="code-with-lines">
      <div className="line-numbers" aria-hidden="true">{lines.map((_, i) => <span key={i}>{i+1}</span>)}</div>
      <pre className="code-content"><code>{code}</code></pre>
    </div>
  )
}

// ── Document Viewer ────────────────────────────────────────────────────────

const SECTION_COLOURS = ['#DAEAE9','#FFFFF0','#F9F0F9','#E8F0FF','#FFF3E0','#F0F9EE']

function renderDocument(md: string): string {
  const sections = md.split(/^(?=## )/m)
  return sections.map((section, idx) => {
    const trimmed = section.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('## ')) {
      const headingEnd = trimmed.indexOf('\n')
      const heading    = headingEnd > -1 ? trimmed.slice(3, headingEnd).trim() : trimmed.slice(3).trim()
      const body       = headingEnd > -1 ? trimmed.slice(headingEnd + 1).trim() : ''
      const colour     = SECTION_COLOURS[(idx - 1) % SECTION_COLOURS.length]
      return `<div class="doc-section" style="background:${colour}">
        <h2 class="doc-section-heading">${inlineFmt(heading)}</h2>
        <div class="doc-section-body">${renderMarkdown(body)}</div>
      </div>`
    }
    return `<div class="doc-preamble">${renderMarkdown(trimmed)}</div>`
  }).join('')
}

function printDocument(label: string, content: string) {
  const win = window.open('', '_blank')
  if (!win) { alert('Please allow pop-ups to export PDF'); return }
  const bodyHtml = renderDocument(content)
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${label}</title>
<style>
  @page { size: A4; margin: 15mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui,-apple-system,sans-serif; color: #08142C; line-height: 1.6; margin: 0; padding: 0; }
  .doc-header { display:flex; align-items:center; gap:12px; padding:0 0 16px; border-bottom:3px solid #FC6C34; margin-bottom:20px; }
  .doc-header-text { }
  .doc-header-title { font-size:20px; font-weight:700; color:#08142C; margin:0; }
  .doc-header-sub { font-size:11px; color:#5C6878; margin:2px 0 0; }
  .doc-logo { width:36px; height:36px; }
  .doc-preamble { margin-bottom:16px; font-size:13px; color:#5C6878; }
  .doc-section { border-radius:8px; padding:16px 20px; margin-bottom:14px; break-inside:avoid; }
  .doc-section-heading { font-size:14px; font-weight:700; color:#08142C; margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em; }
  .doc-section-body { font-size:13px; line-height:1.65; }
  .doc-section-body p { margin:0 0 8px; }
  .doc-section-body p:last-child { margin:0; }
  .doc-section-body ul,.doc-section-body ol { margin:4px 0 8px 18px; padding:0; }
  .doc-section-body li { margin-bottom:3px; }
  .doc-section-body strong { font-weight:600; }
  .doc-section-body table { width:100%; border-collapse:collapse; font-size:12px; margin:8px 0; }
  .doc-section-body th { background:rgba(0,0,0,.06); padding:5px 8px; text-align:left; font-weight:600; border:1px solid rgba(0,0,0,.1); }
  .doc-section-body td { padding:5px 8px; border:1px solid rgba(0,0,0,.1); }
  .doc-footer { margin-top:20px; padding-top:12px; border-top:1px solid #E5E7EB; display:flex; justify-content:space-between; font-size:11px; color:#9CA3AF; }
</style>
</head><body>
<div class="doc-header">
  <img src="${logoUrl}" alt="Adaptavist" style="height:36px;width:auto;object-fit:contain;" onerror="this.style.display='none'"/>
  <div class="doc-header-text">
    <div class="doc-header-title">${label}</div>
    <div class="doc-header-sub">Generated by TAG Engine &middot; adaptavist.com</div>
  </div>
</div>
${bodyHtml}
<div class="doc-footer">
  <span>The Adaptavist Group · adaptavist.com/contact</span>
  <span>Confidential</span>
</div>
</body></html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 600)
}

function DocumentViewer({ code, label }: { code: string; label: string }) {
  return (
    <div className="doc-viewer">
      <div className="doc-header-bar">
        <TagLogo size={32}/>
        <div>
          <div className="doc-viewer-title">{label}</div>
          <div className="doc-viewer-sub">Generated by TAG Engine</div>
        </div>
      </div>

      <div className="doc-body">
        {code.split(/^(?=## )/m).map((section, idx) => {
          const trimmed = section.trim()
          if (!trimmed) return null
          if (trimmed.startsWith('## ')) {
            const headingEnd = trimmed.indexOf('\n')
            const heading    = headingEnd > -1 ? trimmed.slice(3, headingEnd).trim() : trimmed.slice(3).trim()
            const body       = headingEnd > -1 ? trimmed.slice(headingEnd + 1).trim() : ''
            const colour     = SECTION_COLOURS[(idx - 1) % SECTION_COLOURS.length]
            return (
              <div key={idx} className="doc-section" style={{ background: colour }}>
                <div className="doc-section-heading">{heading}</div>
                <div className="doc-section-body prose-ada"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}/>
              </div>
            )
          }
          return (
            <div key={idx} className="doc-preamble prose-ada"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(trimmed) }}/>
          )
        })}
      </div>

      <div className="doc-footer-bar">
        <span>The Adaptavist Group · <a href="https://www.adaptavist.com/contact" target="_blank" rel="noopener">adaptavist.com/contact</a></span>
        <span>Confidential</span>
      </div>
    </div>
  )
}

// ── Artifact Panel ─────────────────────────────────────────────────────────

function ArtifactPanel({ artifacts, currentIdx, onNavigate, onClose, width }: { artifacts: Artifact[]; currentIdx: number; onNavigate: (idx: number) => void; onClose: () => void; width: number }) {
  const [copied, setCopied] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const exportRef = useRef<HTMLDivElement>(null)
  const artifact  = artifacts[currentIdx] ?? null

  useEffect(() => {
    if (!showExport) return
    function h(e: MouseEvent) { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showExport])

  useEffect(() => { setEditing(false) }, [currentIdx])

  const content = artifact ? (overrides[artifact.id] ?? artifact.code) : ''

  function startEdit() {
    if (!artifact) return
    setDraft(content); setEditing(true)
  }
  function saveEdit() {
    if (!artifact) return
    setOverrides(prev => ({ ...prev, [artifact.id]: draft })); setEditing(false)
  }
  function cancelEdit() {
    setEditing(false)
  }
  function copy() {
    if (!artifact) return
    navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  function download(ext: string) {
    if (!artifact) return
    const blob = new Blob([content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${artifact.label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
    setShowExport(false)
  }

  if (!artifact) return null
  const ext     = langExt(artifact.lang)
  const docType = isDoc(artifact.lang)

  return (
    <div className="artifact-panel" style={{ width }}>
      <div className="artifact-header">
        <div className="artifact-header-left">
          <span className="artifact-title" title={artifact.label}>{artifact.label.length > 28 ? artifact.label.slice(0,27)+'…' : artifact.label}</span>
          {artifact.lang && artifact.lang !== 'text' && <span className="artifact-lang-badge">{docType ? 'DOCUMENT' : artifact.lang.toUpperCase()}</span>}
          {artifacts.length > 1 && (
            <div className="artifact-nav">
              <button className="artifact-nav-btn" onClick={() => onNavigate(currentIdx-1)} disabled={currentIdx===0}>←</button>
              <span className="artifact-nav-counter">{currentIdx+1} of {artifacts.length}</span>
              <button className="artifact-nav-btn" onClick={() => onNavigate(currentIdx+1)} disabled={currentIdx===artifacts.length-1}>→</button>
            </div>
          )}
        </div>
        <div className="artifact-header-right">
          <button className={`artifact-action-btn ${copied?'artifact-action-btn-success':''}`} onClick={copy}>
            {copied ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Copied!</> : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>Copy</>}
          </button>
          {docType && (
            editing ? (
              <>
                <button className="artifact-action-btn" onClick={saveEdit}>Save</button>
                <button className="artifact-action-btn" onClick={cancelEdit}>Cancel</button>
              </>
            ) : (
              <button className="artifact-action-btn" onClick={startEdit}>Edit</button>
            )
          )}
          <div className="export-wrapper" ref={exportRef}>
            <button className="artifact-action-btn" onClick={() => setShowExport(v=>!v)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>Export
            </button>
            {showExport && (
              <div className="export-dropdown">
                {docType && <button onClick={() => { printDocument(artifact.label, content); setShowExport(false) }}>Download as PDF</button>}
                <button onClick={() => download('txt')}>Download as .txt</button>
                {!docType && <button onClick={() => download(ext)}>Download as .{ext}</button>}
                <button onClick={() => download('md')}>Download as .md</button>
              </div>
            )}
          </div>
          <button className="artifact-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="artifact-body">
        {docType
          ? (editing
              ? <textarea className="doc-edit-textarea" value={draft} onChange={e => setDraft(e.target.value)}/>
              : <DocumentViewer code={content} label={artifact.label}/>)
          : isCode(artifact.lang)
            ? <CodeWithLineNumbers code={content}/>
            : <div className="artifact-prose prose-ada" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}/>
        }
      </div>
    </div>
  )
}

// ── Screen 1 ───────────────────────────────────────────────────────────────

const PRODUCT_CARDS = [
  { label: 'Jira'       as Product, description: 'Issue tracking, project & workflow management' },
  { label: 'Confluence' as Product, description: 'Docs, knowledge base & team collaboration' },
  { label: 'Both'       as Product, description: 'Touches both Jira and Confluence' },
  { label: 'Unsure'     as Product, description: 'Not sure yet — Ada will help narrow it down' },
]
const DEPLOYMENT_CARDS = [
  { label: 'Cloud'       as Deployment, description: 'Atlassian Cloud — hosted by Atlassian' },
  { label: 'Data Center' as Deployment, description: 'Self-managed on your own infrastructure' },
  { label: 'Unsure'      as Deployment, description: 'Not confirmed — Ada will factor in both' },
]

function PlatformScreen({ onStart }: { onStart: (p: Product, d: Deployment, r: Role) => void }) {
  const [product,    setProduct]    = useState<Product | null>(null)
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [role,       setRole]       = useState<Role | ''>('')
  const ready = product !== null && deployment !== null && role !== ''

  return (
    <div className="screen-center">
      <div className="logo-lockup"><TagLogo size={40}/><div><div className="logo-title">TAG Engine</div><div className="logo-subtitle">Powered by Ada</div></div></div>
      <h1 className="screen-heading">What platform is this for?</h1>
      <p className="screen-subtext">Select your role, product and deployment type to get tailored recommendations.</p>
      <div className="card">
        <div className="selector-group">
          <label className="selector-label" htmlFor="role-select">Your role</label>
          <div className="role-select-wrapper">
            <select id="role-select" className={`role-select ${role ? 'role-select-filled' : ''}`} value={role} onChange={e => setRole(e.target.value as Role | '')}>
              <option value="">Select your role…</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <svg className="role-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="selector-divider"/>
        <div className="selector-group">
          <label className="selector-label">Product</label>
          <div className="card-grid">
            {PRODUCT_CARDS.map(({label,description}) => <SelectionCard key={label} label={label} description={description} selected={product===label} onClick={()=>setProduct(label)}/>)}
          </div>
        </div>
        <div className="selector-divider"/>
        <div className="selector-group">
          <label className="selector-label">Deployment</label>
          <div className="card-grid card-grid-3">
            {DEPLOYMENT_CARDS.map(({label,description}) => <SelectionCard key={label} label={label} description={description} selected={deployment===label} onClick={()=>setDeployment(label)}/>)}
          </div>
        </div>
      </div>
      <button className={`btn-primary ${!ready?'btn-disabled':''}`} disabled={!ready} onClick={() => ready && onStart(product!, deployment!, role as Role)}>Start →</button>
    </div>
  )
}

// ── Screen 2 ───────────────────────────────────────────────────────────────

function ProblemScreen({ product, deployment, role, onSubmit, onBack }: { product: Product; deployment: Deployment; role: Role; onSubmit: (p: string) => void; onBack: () => void }) {
  const [problem, setProblem] = useState('')
  const [loading, setLoading] = useState(false)
  const ready = problem.trim().length > 10
  function submit() { if (!ready||loading) return; setLoading(true); onSubmit(problem.trim()) }
  return (
    <div className="screen-center">
      <button onClick={onBack} className="back-btn">← Back</button>
      <div className="logo-lockup logo-lockup-sm"><TagLogo size={28}/><div className="logo-title logo-title-sm">TAG Engine</div></div>
      <div className="mb-4"><PlatformBadge product={product} deployment={deployment} role={role}/></div>
      <h2 className="screen-heading">Describe the workflow challenge</h2>
      <p className="screen-subtext">In plain language — Ada will match it to the right Adaptavist product.</p>
      <div className="card card-tight">
        <textarea className="problem-textarea" placeholder="e.g. Our team is spending hours manually moving issues between projects after each sprint. We need something that can automate this." value={problem} onChange={e=>setProblem(e.target.value)} rows={6} disabled={loading} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}}/>
      </div>
      <p className="input-hint">Enter to submit · Shift + Enter for a new line</p>
      <button className={`btn-primary ${!ready||loading?'btn-disabled':''}`} disabled={!ready||loading} onClick={submit}>{loading?'Finding a solution…':'Find a solution →'}</button>
    </div>
  )
}

// ── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Ada — part of the TAG Engine, an internal Adaptavist tool that helps staff identify the right product for a workflow challenge.

MANDATORY OUTPUT FORMAT — apply this before anything else:
Every response longer than 2–3 sentences MUST use markdown formatting. No walls of unbroken text. Busy professionals scan before they read.

Required formatting:
- Use ## headings to label every major section when covering more than one topic
- Use bullet points (- item) for ANY list of parallel items: capabilities, pain points, caveats, questions, differentiators. If listing 3+ things in a sentence, stop and use bullets instead
- Use numbered steps (1. step) for any sequence or process
- Use tables (| col | col |) to compare options, products, or features side by side
- Use **bold** for product names on first mention and for critical caveats
- Never use em dashes, en dashes, or hyphens as sentence punctuation. Use commas, periods, or separate sentences instead. Hyphens are only acceptable inside compound words (e.g. "well-known") or code.

Example of a correctly formatted response:

The team is spending time on manual transitions — this is a workflow automation gap.

## Recommended product

**ScriptRunner for Jira** handles this directly using scripted post functions attached to workflow transitions.

## What it can do here
- Auto-transition issues when a sprint closes
- Move issues between projects in bulk on a trigger
- Fire logic based on custom field changes or time-based events

## Things to be aware of
- Requires Jira admin access to configure post functions
- Cloud and Data Center APIs differ slightly

## Suggested next steps
1. Confirm Cloud vs Data Center deployment
2. Review post functions docs at docs.adaptavist.com
3. Run a proof-of-concept on a non-production project

ROLE: Adapt content, depth and angle to the user's stated role (provided at start of each session).

Sales: Business outcomes, pain points, discovery questions, cross-sell/upsell angles. No implementation detail. Suggest involving a CSM for demos/adoption, SE for technical validation.
Customer Success Manager: Adoption path, success metrics, change management, expansion opportunities. Owns demos and success planning.
Solution Engineer: Full technical depth — architecture, integrations, security, Cloud vs DC differences, limitations. Offer scripts when relevant.
Administrator: Config steps, governance, permissions, operational impact. Scripts and examples appropriate.
Technical User: APIs, scripting, integration patterns, advanced config. Full code depth. Offer scripts.
Product Manager: Use cases, portfolio fit, strengths/gaps, competitive positioning, demand signals.
Marketing: Value props in customer language, pain points, differentiators, messaging angles.
Channel Partner: Partner positioning, customer value, services opportunities, expansion angles.
Executive / Decision Maker: ROI, productivity outcomes, governance, strategic alignment. No implementation detail.
Support Engineer: Known issues, troubleshooting steps, workarounds, escalation guidance.

PRODUCTS (only recommend those compatible with stated platform and deployment):
- ScriptRunner for Jira (Cloud & Data Center) — automation, scripted workflows, custom listeners, JQL extensions
- ScriptRunner for Confluence (Cloud & Data Center) — scripted macros, dynamic content, page automation
- ScriptRunner for Bitbucket (Data Center) — repo-level scripting and hooks
- ScriptRunner Connect — integration between Atlassian tools and external systems
- ScriptRunner Migration Suite — Jira/Confluence migration tooling
- ScriptRunner Enhanced Search — advanced search and filtering beyond native JQL
- Mosaic (Cloud & Data Center) — formatting, layouts, branded templates for Confluence. Advanced Mosaic for complex design systems.
- Hierarchy for Jira (Cloud only) — multi-level issue hierarchy visualisation

Always say "Mosaic" not "Kolekti". Never recommend tools outside The Adaptavist Group. Never fabricate capabilities.

Knowledge base: docs.adaptavist.com | scriptrunnerhq.com | kolekti.com | upscale.tech
Contact & support portal: https://www.adaptavist.com/contact — use this link when:
- Suggesting a feature request to the Product team
- Recommending the user speak to a CSM, SE, or Sales contact
- Directing someone to Adaptavist support or the partnerships team
Always provide this URL rather than asking someone to "get in touch" generically.

RESPONSE RULES:
1. Start by acknowledging the problem in one brief sentence, then move directly to the recommendation. Never include a section that diagnoses or explains the root cause of the problem (e.g. a "What's likely driving this" section with bulleted causes). The user already understands their own situation.
2. Bold the product name on first mention only
3. If multiple products are relevant, present them together without ranking one as primary over another.
4. If the problem is unclear, ask one focused question
5. If no product fits, say so honestly — mention native Atlassian workarounds and suggest a feature request
6. Never close with a generic sign-off

SETUP GUIDES (only when explicitly asked): Numbered steps. For ScriptRunner include a Groovy code block — the UI shows it in a side panel. Script must open with:

\`\`\`groovy
/*
 * TAG Engine — ScriptRunner Artefact
 * Purpose:       [One sentence]
 * Trigger:       [Post Function / Listener / Scheduled Job]
 * Compatibility: [ScriptRunner for Jira Cloud / Data Center]
 * Prerequisites: [Fields, configs, permissions needed]
 * Docs:          https://docs.adaptavist.com/
 */
// [well-commented Groovy code]
\`\`\`

DOCUMENT GENERATION: When a user asks for a one-pager, business case, executive summary, workflow overview, pitch document, or any shareable document, generate it as a document code block. The UI will render it as a branded, styled document with coloured section cards that can be exported as PDF.

Format documents like this:

\`\`\`document
# [Document Title]

[One or two sentence introduction or context — no heading, just prose]

## [Section heading e.g. The Challenge]
[Content for this section]

## [Section heading e.g. Recommended Solution]
[Content — use bullets, tables, bold where helpful]

## [Section heading e.g. Key Benefits]
- Benefit one with brief explanation
- Benefit two with brief explanation

## [Section heading e.g. Business Impact]
[ROI, productivity, risk reduction — keep it concrete]

## [Section heading e.g. Next Steps]
1. First action
2. Second action
3. Third action

## Get in Touch
To discuss further or request a demonstration, contact the Adaptavist team at [adaptavist.com/contact](https://www.adaptavist.com/contact)
\`\`\`

Rules for documents:
- Keep language appropriate to the intended reader (exec = strategic, CSM = outcomes, SE = technical)
- Each ## section becomes a distinct coloured card in the rendered document
- Limit to 6–8 sections maximum — this is a one-pager, not a report
- Use the role context to determine tone and content emphasis
- Always include a "Get in Touch" section with the contact URL

INTERACTIVE OPTIONS: End every response with 2–3 follow-up choices in [[double brackets]] on their own lines after all content. Pick options appropriate to the role and topic.

Sales: [[What discovery questions should I ask?]] [[How would I build a business case?]] [[Should I loop in a Solution Engineer?]]
CSM: [[What does a good adoption plan look like?]] [[How should we measure success?]] [[Are there expansion opportunities here?]]
Technical: [[Show me what the script would look like]] [[Help me get it set up]] [[What are the technical limitations?]] [[How does this differ between Cloud and Data Center?]]
General: [[Tell me more about how this works]] [[Is there another product that could help?]] [[What would the demo angle be?]] [[Are there any limitations I should know about?]]

Only use [[...]] for selectable choices.`

// ── Ada API call ───────────────────────────────────────────────────────────
//
// This calls a ScriptRunner Connect webhook, which holds the Anthropic API
// key safely on the server side and forwards the conversation to Claude.
// The browser never sees the API key.

const ADA_ENDPOINT = 'https://event.scriptrunnerconnect.com/ioyk7g6ee2nyqav5xyn7pm'

function getOrCreateUserId(): string {
  const existing = localStorage.getItem('tagEngineUserId')
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem('tagEngineUserId', id)
  return id
}

async function callAda(messages: { role: 'user' | 'assistant' | 'system'; content: string }[]): Promise<string> {
  const userId = getOrCreateUserId()
  const res = await fetch(ADA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, userId }),
  })
  if (!res.ok) {
    throw new Error(`Ada request failed (${res.status})`)
  }
  const data = await res.json()
  return data.content[0].text as string
}

// ── Screen 3 ───────────────────────────────────────────────────────────────

const DEFAULT_PANEL_WIDTH = 480
const MIN_CHAT_WIDTH      = 380
const MIN_PANEL_WIDTH     = 320

function ResultsScreen({ product, deployment, role, initialProblem, onReset, onChangeProduct, onChangeDeployment, onChangeRole }: {
  product: Product; deployment: Deployment; role: Role; initialProblem: string; onReset: () => void
  onChangeProduct: (v: Product) => void
  onChangeDeployment: (v: Deployment) => void
  onChangeRole: (v: Role) => void
}) {
  const [messages,   setMessages]   = useState<Message[]>([])
  const [followUp,   setFollowUp]   = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isMobile,   setIsMobile]   = useState(() => window.innerWidth < 768)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const hasInit       = useRef(false)
  const apiHistoryRef = useRef<Message[]>([])
  const prevArtCount  = useRef(0)
  const dragState     = useRef({ active: false, startX: 0, startWidth: 0 })

  const artifacts = useMemo(() => {
    const all: Artifact[] = []
    messages.forEach((m, i) => { if (m.role === 'assistant') all.push(...extractArtifacts(m.content, i)) })
    return all
  }, [messages])

  useEffect(() => {
    if (artifacts.length > prevArtCount.current) { setPanelOpen(true); setCurrentIdx(artifacts.length-1) }
    prevArtCount.current = artifacts.length
  }, [artifacts.length])

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { if (!hasInit.current) { hasInit.current = true; run() } }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function run() {
    const apiMsg = `Role: ${role}\nPlatform: ${product} | Deployment: ${deployment}\n\nWorkflow challenge: ${initialProblem}`
    apiHistoryRef.current = [{ role: 'user', content: apiMsg }]
    setMessages([{ role: 'user', content: initialProblem }])
    await fetchAda()
  }

  async function fetchAda() {
    setLoading(true); setError(null)
    try {
      const msgs = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...apiHistoryRef.current.map(m => ({ role: m.role as 'user'|'assistant'|'system', content: m.content })),
      ]
      const text = await callAda(msgs)
      const msg: Message = { role: 'assistant', content: text }
      apiHistoryRef.current = [...apiHistoryRef.current, msg]
      setMessages(prev => [...prev, msg])
    } catch { setError('Ada hit a snag — please try again.') }
    finally  { setLoading(false) }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const msg: Message = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, msg])
    apiHistoryRef.current = [...apiHistoryRef.current, msg]
    setFollowUp(''); await fetchAda()
  }

  function handleChangeProduct(v: Product) {
    onChangeProduct(v)
    sendContextUpdate(`Context update: the platform product has been changed to ${v}.`)
  }
  function handleChangeDeployment(v: Deployment) {
    onChangeDeployment(v)
    sendContextUpdate(`Context update: the deployment type has been changed to ${v}.`)
  }
  function handleChangeRole(v: Role) {
    onChangeRole(v)
    sendContextUpdate(`Context update: the user's role has been changed to ${v}. Please adjust your approach accordingly.`)
  }
  function sendContextUpdate(text: string) {
    const msg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, msg])
    apiHistoryRef.current = [...apiHistoryRef.current, msg]
    fetchAda()
  }

  async function retryLast() {
    setError(null)
    if (apiHistoryRef.current[apiHistoryRef.current.length-1]?.role === 'assistant') {
      apiHistoryRef.current = apiHistoryRef.current.slice(0,-1)
      setMessages(prev => { const idx = [...prev].map((m,i)=>({m,i})).reverse().find(x=>x.m.role==='assistant')?.i; return idx!=null?prev.slice(0,idx):prev })
    }
    await fetchAda()
  }

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { active: true, startX: e.clientX, startWidth: panelWidth }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    function onMove(ev: MouseEvent) {
      if (!dragState.current.active) return
      const maxW = window.innerWidth - MIN_CHAT_WIDTH - 4
      setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(dragState.current.startWidth + (dragState.current.startX - ev.clientX), maxW)))
    }
    function onUp() {
      dragState.current.active = false; document.body.style.cursor = ''; document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [panelWidth])

  const lastAssistantIdx  = messages.reduce((acc,m,i) => m.role==='assistant' ? i : acc, -1)
  const artifactMsgIdxSet = useMemo(() => new Set(artifacts.map(a=>a.msgIndex)), [artifacts])

  return (
    <div className="results-wrapper">
      <div className="results-topbar">
        <div className="flex items-center gap-3">
          <TagLogo size={28}/>
          <span className="results-title">TAG Engine</span>
          <PlatformBadge product={product} deployment={deployment} role={role}
            onChangeProduct={handleChangeProduct}
            onChangeDeployment={handleChangeDeployment}
            onChangeRole={handleChangeRole}/>
        </div>
        <button onClick={onReset} className="reset-btn">↺ Start over</button>
      </div>

      <div className="results-body">
        <div className="conversation-side">
          <div className="thread-container">
            <div className="thread-inner">
              {messages.map((msg,i) => (
                <div key={i} className={`msg-row ${msg.role==='user'?'msg-user':'msg-ada'}`}>
                  {msg.role==='assistant' && <AdaAvatar/>}
                  {msg.role==='assistant'
                    ? <AdaMessage content={msg.content} isLast={i===lastAssistantIdx} isLoading={loading} hasArtifact={artifactMsgIdxSet.has(i)} onOption={sendMessage}
                        onOpenArtifact={() => {
                          const idx = artifacts.findIndex(a => a.msgIndex === i)
                          if (idx !== -1) { setCurrentIdx(idx); setPanelOpen(true) }
                        }}/>
                    : <div className="msg-bubble msg-bubble-user"><p className="msg-user-text">{msg.content}</p></div>
                  }
                </div>
              ))}
              {loading && <div className="msg-row msg-ada"><AdaAvatar/><LoadingMessage/></div>}
              {error && <div className="error-banner"><span>{error}</span><button className="retry-btn" onClick={retryLast}>Retry</button></div>}
              <div ref={bottomRef}/>
            </div>
          </div>
          <div className="followup-bar">
            <div className="followup-inner">
              <textarea className="followup-input" placeholder="Ask Ada a follow-up question…" value={followUp} rows={1} disabled={loading} onChange={e=>setFollowUp(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(followUp)}}}/>
              <button className={`send-btn ${!followUp.trim()||loading?'send-btn-disabled':''}`} disabled={!followUp.trim()||loading} onClick={()=>sendMessage(followUp)} aria-label="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <p className="followup-hint">Enter to send · Shift + Enter for new line</p>
          </div>
        </div>

        {panelOpen && !isMobile && <div className="drag-handle" onMouseDown={onDragStart}/>}

        {!isMobile && (
          <div className="artifact-panel-outer" style={{ width: panelOpen ? panelWidth : 0, transition: panelOpen ? 'width 200ms ease-out' : 'width 150ms ease-in' }}>
            {artifacts.length > 0 && <ArtifactPanel artifacts={artifacts} currentIdx={Math.min(currentIdx,artifacts.length-1)} onNavigate={setCurrentIdx} onClose={()=>setPanelOpen(false)} width={panelWidth}/>}
          </div>
        )}

        {isMobile && panelOpen && artifacts.length > 0 && (
          <div className="artifact-mobile-overlay" onClick={e=>{if(e.target===e.currentTarget)setPanelOpen(false)}}>
            <ArtifactPanel artifacts={artifacts} currentIdx={Math.min(currentIdx,artifacts.length-1)} onNavigate={setCurrentIdx} onClose={()=>setPanelOpen(false)} width={window.innerWidth}/>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,     setScreen]     = useState<Screen>('platform')
  const [product,    setProduct]    = useState<Product    | null>(null)
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [role,       setRole]       = useState<Role       | null>(null)
  const [problem,    setProblem]    = useState<string     | null>(null)

  function reset() { setProduct(null); setDeployment(null); setRole(null); setProblem(null); setScreen('platform') }

  if (screen==='platform') return <PlatformScreen onStart={(p,d,r)=>{setProduct(p);setDeployment(d);setRole(r);setScreen('problem')}}/>
  if (screen==='problem')  return <ProblemScreen product={product!} deployment={deployment!} role={role!} onBack={()=>setScreen('platform')} onSubmit={p=>{setProblem(p);setScreen('results')}}/>
  return <ResultsScreen product={product!} deployment={deployment!} role={role!} initialProblem={problem!} onReset={reset}
    onChangeProduct={p => setProduct(p)}
    onChangeDeployment={d => setDeployment(d)}
    onChangeRole={r => setRole(r)}/>
}
