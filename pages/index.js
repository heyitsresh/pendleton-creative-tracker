import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import CATALOG from '../lib/catalogData'

const { products, f26_new, stats, cats, depts } = CATALOG

// ── helpers ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Active: { bg: '#dcfce7', color: '#166534' },
  Inactive: { bg: '#fee2e2', color: '#991b1b' },
  Removed: { bg: '#f1f5f9', color: '#64748b' },
  Incomplete: { bg: '#fef9c3', color: '#854d0e' },
}
const CR_COLORS = {
  Done: { bg: '#dcfce7', color: '#166534' },
  Uploading: { bg: '#fef9c3', color: '#854d0e' },
  'In Progress': { bg: '#dbeafe', color: '#1e40af' },
  Pending: { bg: '#f1f5f9', color: '#64748b' },
}
const OVERRIDE_OPTIONS = ['', 'Needs Attention', 'Optimized', 'Pending Update', 'In Review', 'Done']
const CR_OPTIONS = ['', 'Done', 'Uploading', 'In Progress', 'Pending', 'N/A']

function Pill({ label, style }) {
  const s = STATUS_COLORS[label] || { bg: '#f1f5f9', color: '#64748b' }
  return (
    <span style={{
      display: 'inline-block', borderRadius: 10, padding: '2px 8px',
      fontSize: 10, fontWeight: 700, background: s.bg, color: s.color,
      whiteSpace: 'nowrap', ...style
    }}>{label}</span>
  )
}
function CrChip({ label, val }) {
  const s = CR_COLORS[val] || { bg: '#f3f4f6', color: '#9ca3af' }
  return (
    <span style={{
      display: 'inline-block', borderRadius: 4, padding: '1px 5px',
      fontSize: 9, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap'
    }}>{label}: {val || '—'}</span>
  )
}
function Check({ ok }) {
  return <span style={{ color: ok ? '#22c55e' : '#d1d5db', fontSize: 13 }}>{ok ? '✓' : '–'}</span>
}

// debounce helper
function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ── Supabase helpers ────────────────────────────────────────────────────────
async function fetchAllEdits() {
  const { data, error } = await supabase.from('pendleton_edits').select('*')
  if (error) { console.error('Fetch error:', error); return {} }
  const map = {}
  data.forEach(row => { map[row.asin] = row })
  return map
}

async function upsertEdit(asin, patch) {
  const { error } = await supabase.from('pendleton_edits').upsert(
    { asin, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'asin' }
  )
  if (error) console.error('Save error:', error)
}

// ── MASTER TAB ──────────────────────────────────────────────────────────────
function MasterTab({ edits, setEdits }) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [f26Only, setF26Only] = useState(false)
  const [crOnly, setCrOnly] = useState(false)
  const [flagOnly, setFlagOnly] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [saving, setSaving] = useState({}) // asin → bool

  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s => ({ ...s, [asin]: true }))
    await upsertEdit(asin, patch)
    setSaving(s => { const n = { ...s }; delete n[asin]; return n })
  }, 700)

  function updateEdit(asin, patch) {
    setEdits(prev => ({ ...prev, [asin]: { ...(prev[asin] || {}), asin, ...patch } }))
    debouncedUpsert(asin, patch)
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = products.filter(p => {
    if (catFilter && p.cat !== catFilter) return false
    if (deptFilter && p.dept !== deptFilter) return false
    if (statusFilter && p.status !== statusFilter) return false
    if (f26Only && !p.f26) return false
    if (crOnly && !p.creative) return false
    const e = edits[p.id] || {}
    if (flagOnly && !e.flag_red && !e.flag_blue && !e.flag_star) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${p.title} ${p.id} ${p.pg} ${(p.children || []).map(c => c.asin + ' ' + c.sku).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // group by category
  const grouped = []
  let curCat = null
  filtered.forEach(p => {
    if (p.cat !== curCat) { grouped.push({ type: 'cat', cat: p.cat }); curCat = p.cat }
    grouped.push({ type: 'product', p })
  })

  return (
    <div>
      {/* Toolbar */}
      <div style={S.toolbar}>
        <input style={S.searchBox} placeholder="Search product, ASIN, SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.sel} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={S.sel} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All Depts</option>
          {depts.filter(Boolean).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={S.sel} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <label style={S.cbLabel}><input type="checkbox" checked={f26Only} onChange={e => setF26Only(e.target.checked)} /> F26 Only</label>
        <label style={S.cbLabel}><input type="checkbox" checked={crOnly} onChange={e => setCrOnly(e.target.checked)} /> Has Creative</label>
        <label style={S.cbLabel}><input type="checkbox" checked={flagOnly} onChange={e => setFlagOnly(e.target.checked)} /> Flagged</label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#888' }}>{filtered.length} products</span>
        <button style={S.btnGray} onClick={() => setExpanded(new Set(products.map(p => p.id)))}>Expand All</button>
        <button style={S.btnGray} onClick={() => setExpanded(new Set())}>Collapse</button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', padding: '0 16px 24px' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 28 }}></th>
              <th style={{ ...S.th, width: 110 }}>ASIN</th>
              <th style={{ ...S.th, width: 230 }}>Product</th>
              <th style={{ ...S.th, width: 65 }}>Dept</th>
              <th style={{ ...S.th, width: 75 }}>Amazon Status</th>
              <th style={{ ...S.th, width: 90 }}>My Status</th>
              <th style={{ ...S.th, width: 50 }}>Price</th>
              <th style={{ ...S.th, width: 40 }}>SKUs</th>
              <th style={{ ...S.th, width: 195 }}>Optimization</th>
              <th style={{ ...S.th, width: 95 }}>F26</th>
              <th style={{ ...S.th, width: 125 }}>Creative Status</th>
              <th style={{ ...S.th, width: 140 }}>Notes</th>
              <th style={{ ...S.th, width: 80 }}>Flag</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((item, i) => {
              if (item.type === 'cat') {
                return (
                  <tr key={`cat-${item.cat}-${i}`}>
                    <td colSpan={13} style={S.catRow}>{item.cat}</td>
                  </tr>
                )
              }
              const { p } = item
              const e = edits[p.id] || {}
              const isExp = expanded.has(p.id)
              const hasChildren = (p.children || []).length > 0
              const isSaving = saving[p.id]

              return [
                <tr key={p.id} style={S.pRow}>
                  <td style={{ ...S.td, textAlign: 'center', padding: '4px 4px' }}>
                    {hasChildren && (
                      <button onClick={() => toggleExpand(p.id)} style={S.expandBtn}>
                        {isExp ? '▾' : '▸'}
                      </button>
                    )}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 10 }}>
                    <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer"
                      style={{ color: '#4a6cf7', textDecoration: 'none' }}>{p.id}</a>
                    {isSaving && <span style={{ marginLeft: 4, fontSize: 9, color: '#f59e0b' }}>saving…</span>}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>{p.title || '—'}</td>
                  <td style={{ ...S.td, fontSize: 11, color: '#555' }}>{p.dept || '—'}</td>
                  <td style={S.td}><Pill label={p.status} /></td>
                  {/* My Status — editable */}
                  <td style={S.td}>
                    <select
                      value={e.status_override || ''}
                      onChange={ev => updateEdit(p.id, { status_override: ev.target.value })}
                      style={{ ...S.inlineSelect, background: e.status_override ? '#ede9fe' : '#fff', color: e.status_override ? '#6d28d9' : '#666' }}
                    >
                      {OVERRIDE_OPTIONS.map(o => <option key={o} value={o}>{o || '— set status'}</option>)}
                    </select>
                  </td>
                  <td style={{ ...S.td, fontSize: 11 }}>{p.price != null ? `$${p.price}` : '—'}</td>
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 11 }}>{p.n}</td>
                  <td style={{ ...S.td, fontSize: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span><Check ok={p.bi} /> Bullets</span>
                      <span><Check ok={p.di} /> Desc</span>
                      <span><Check ok={p.mi} /> Main Img</span>
                      <span><Check ok={p.ii} /> Gallery</span>
                    </div>
                  </td>
                  {/* F26 */}
                  <td style={S.td}>
                    {p.f26 ? (
                      <div>
                        <span style={{
                          display: 'inline-block', borderRadius: 10, padding: '2px 7px',
                          fontSize: 10, fontWeight: 700,
                          background: p.f26.type === 'New Variation' ? '#ede9fe' : '#fef3c7',
                          color: p.f26.type === 'New Variation' ? '#6d28d9' : '#92400e'
                        }}>{p.f26.type === 'New Variation' ? 'New Var' : 'New Style'}</span>
                        {p.f26.launch && <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{p.f26.launch}</div>}
                      </div>
                    ) : '—'}
                  </td>
                  {/* Creative Status — editable if no tracker data */}
                  <td style={S.td}>
                    {p.creative ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <CrChip label="Inf" val={e.cr_inf || p.creative.inf} />
                        <CrChip label="Copy" val={e.cr_copy || p.creative.copy} />
                        <CrChip label="A+" val={e.cr_aplus || p.creative.aplus} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <select value={e.cr_inf || ''} onChange={ev => updateEdit(p.id, { cr_inf: ev.target.value })} style={S.crSelect}>
                          {CR_OPTIONS.map(o => <option key={o} value={o}>{o || 'Inf…'}</option>)}
                        </select>
                        <select value={e.cr_copy || ''} onChange={ev => updateEdit(p.id, { cr_copy: ev.target.value })} style={S.crSelect}>
                          {CR_OPTIONS.map(o => <option key={o} value={o}>{o || 'Copy…'}</option>)}
                        </select>
                        <select value={e.cr_aplus || ''} onChange={ev => updateEdit(p.id, { cr_aplus: ev.target.value })} style={S.crSelect}>
                          {CR_OPTIONS.map(o => <option key={o} value={o}>{o || 'A+…'}</option>)}
                        </select>
                      </div>
                    )}
                  </td>
                  {/* Notes */}
                  <td style={S.td}>
                    <textarea
                      defaultValue={e.notes || ''}
                      placeholder="Add note…"
                      rows={1}
                      onBlur={ev => updateEdit(p.id, { notes: ev.target.value })}
                      style={S.noteArea}
                    />
                  </td>
                  {/* Flags */}
                  <td style={{ ...S.td, padding: '4px 6px' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[['red','🔴'],['blue','🔵'],['star','⭐']].map(([f, emoji]) => (
                        <button key={f}
                          onClick={() => updateEdit(p.id, { [`flag_${f}`]: !e[`flag_${f}`] })}
                          style={{ ...S.flagBtn, background: e[`flag_${f}`] ? '#e0e7ff' : '#f9fafb', borderColor: e[`flag_${f}`] ? '#818cf8' : '#e5e7eb' }}
                          title={f}
                        >{emoji}</button>
                      ))}
                    </div>
                  </td>
                </tr>,
                // Children
                ...((p.children || []).map(c => (
                  <tr key={c.asin} style={{ display: isExp ? 'table-row' : 'none', background: '#f8faff' }}>
                    <td style={S.td}></td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 10, paddingLeft: 20 }}>
                      <a href={`https://www.amazon.com/dp/${c.asin}`} target="_blank" rel="noreferrer"
                        style={{ color: '#4a6cf7', textDecoration: 'none' }}>{c.asin}</a>
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: '#555', paddingLeft: 24 }}>{c.title || c.sku}</td>
                    <td style={S.td}></td>
                    <td style={S.td}><Pill label={c.status} /></td>
                    <td style={S.td}></td>
                    <td style={{ ...S.td, fontSize: 11 }}>{c.price != null ? `$${c.price}` : '—'}</td>
                    <td style={S.td}></td>
                    <td style={{ ...S.td, fontSize: 10 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span><Check ok={c.bi} /> Bullets</span>
                        <span><Check ok={c.di} /> Desc</span>
                        <span><Check ok={c.mi} /> Main</span>
                        <span><Check ok={c.ii} /> Gallery</span>
                      </div>
                    </td>
                    <td style={S.td}></td><td style={S.td}></td><td style={S.td}></td><td style={S.td}></td>
                  </tr>
                )))
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── F26 TAB ─────────────────────────────────────────────────────────────────
function F26Tab({ edits, setEdits }) {
  const [saving, setSaving] = useState({})
  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s => ({ ...s, [asin]: true }))
    await upsertEdit(asin, patch)
    setSaving(s => { const n = { ...s }; delete n[asin]; return n })
  }, 700)

  function updateEdit(asin, patch) {
    setEdits(prev => ({ ...prev, [asin]: { ...(prev[asin] || {}), asin, ...patch } }))
    debouncedUpsert(asin, patch)
  }

  // Live products with F26 flag
  const liveF26 = products.filter(p => p.f26)
  const CR_OPTIONS_F26 = ['', 'Done', 'Uploading', 'In Progress', 'Pending', 'N/A']

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      {/* Pending (new, not in ALR) */}
      <h2 style={S.sectionTitle}>📦 Pending — New Listings Not Yet Created</h2>
      <table style={{ ...S.table, marginBottom: 32 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 260 }}>Product Name</th>
            <th style={{ ...S.th, width: 90 }}>Type</th>
            <th style={{ ...S.th, width: 110 }}>Launch Date</th>
            <th style={{ ...S.th, width: 80 }}>Infographics</th>
            <th style={{ ...S.th, width: 80 }}>Copy</th>
            <th style={{ ...S.th, width: 80 }}>A+ Content</th>
            <th style={{ ...S.th, width: 130 }}>Jira</th>
          </tr>
        </thead>
        <tbody>
          {f26_new.map((r, i) => (
            <tr key={i} style={S.pRow}>
              <td style={{ ...S.td, fontWeight: 600 }}>{r.name || '—'}</td>
              <td style={S.td}>
                <span style={{
                  display: 'inline-block', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                  background: r.type === 'New Towel' ? '#fef3c7' : '#ede9fe',
                  color: r.type === 'New Towel' ? '#92400e' : '#6d28d9'
                }}>{r.type}</span>
              </td>
              <td style={{ ...S.td, fontSize: 11 }}>{r.launch || '—'}</td>
              <td style={S.td}><CrChip label="Inf" val={r.cr?.inf} /></td>
              <td style={S.td}><CrChip label="Copy" val={r.cr?.copy} /></td>
              <td style={S.td}><CrChip label="A+" val={r.cr?.aplus} /></td>
              <td style={S.td}>
                {r.jira?.epic
                  ? <a href={`https://avenue7media.atlassian.net/browse/${r.jira.epic}`} target="_blank" rel="noreferrer"
                      style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>
                      {r.jira.epic}
                    </a>
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Live (in ALR, tagged F26) */}
      <h2 style={S.sectionTitle}>✅ Live in Catalog — F26 Products</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 110 }}>ASIN</th>
            <th style={{ ...S.th, width: 230 }}>Product</th>
            <th style={{ ...S.th, width: 75 }}>Status</th>
            <th style={{ ...S.th, width: 90 }}>Type</th>
            <th style={{ ...S.th, width: 80 }}>Inf</th>
            <th style={{ ...S.th, width: 80 }}>Copy</th>
            <th style={{ ...S.th, width: 80 }}>A+</th>
            <th style={{ ...S.th, width: 150 }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {liveF26.map(p => {
            const e = edits[p.id] || {}
            return (
              <tr key={p.id} style={S.pRow}>
                <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 10 }}>
                  <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer"
                    style={{ color: '#4a6cf7', textDecoration: 'none' }}>{p.id}</a>
                </td>
                <td style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>{p.title}</td>
                <td style={S.td}><Pill label={p.status} /></td>
                <td style={S.td}>
                  <span style={{
                    display: 'inline-block', borderRadius: 10, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                    background: p.f26.type === 'New Variation' ? '#ede9fe' : '#fef3c7',
                    color: p.f26.type === 'New Variation' ? '#6d28d9' : '#92400e'
                  }}>{p.f26.type === 'New Variation' ? 'New Var' : 'New Style'}</span>
                </td>
                {/* Editable creative status for live F26 */}
                {['cr_inf','cr_copy','cr_aplus'].map(field => {
                  const fallback = p.creative ? p.creative[field.replace('cr_','').replace('aplus','aplus')] : null
                  const mapped = { cr_inf: 'inf', cr_copy: 'copy', cr_aplus: 'aplus' }
                  const crVal = e[field] || (p.creative ? p.creative[mapped[field]] : null)
                  return (
                    <td key={field} style={S.td}>
                      <select value={e[field] || ''} onChange={ev => updateEdit(p.id, { [field]: ev.target.value })}
                        style={{ ...S.crSelect, minWidth: 72 }}>
                        <option value="">{crVal || '—'}</option>
                        {CR_OPTIONS_F26.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                })}
                <td style={S.td}>
                  <textarea defaultValue={e.notes || ''} placeholder="Note…" rows={1}
                    onBlur={ev => updateEdit(p.id, { notes: ev.target.value })} style={S.noteArea} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CREATIVE TAB ─────────────────────────────────────────────────────────────
function CreativeTab({ edits, setEdits }) {
  const [saving, setSaving] = useState({})
  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s => ({ ...s, [asin]: true }))
    await upsertEdit(asin, patch)
    setSaving(s => { const n = { ...s }; delete n[asin]; return n })
  }, 700)

  function updateEdit(asin, patch) {
    setEdits(prev => ({ ...prev, [asin]: { ...(prev[asin] || {}), asin, ...patch } }))
    debouncedUpsert(asin, patch)
  }

  const trackedProducts = products.filter(p => p.creative)
  const CR_OPTIONS_FULL = ['Done', 'Uploading', 'In Progress', 'Pending', 'N/A']

  function statusSummary(field) {
    const counts = {}
    trackedProducts.forEach(p => {
      const e = edits[p.id] || {}
      const val = e[`cr_${field}`] || (p.creative ? p.creative[field] : null) || 'Pending'
      counts[val] = (counts[val] || 0) + 1
    })
    return counts
  }

  const infSummary = statusSummary('inf')
  const copySummary = statusSummary('copy')
  const aplusSummary = statusSummary('aplus')

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Infographics', data: infSummary },
          { label: 'Product Copy', data: copySummary },
          { label: 'A+ Content', data: aplusSummary },
        ].map(({ label, data }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.08)', minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#1a1a2e' }}>{label}</div>
            {Object.entries(data).map(([status, count]) => {
              const s = CR_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' }
              return (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ background: s.bg, color: s.color, borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{status}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{count}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Detail table */}
      <h2 style={S.sectionTitle}>Creative Tracker — {trackedProducts.length} Products</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 110 }}>ASIN</th>
            <th style={{ ...S.th, width: 230 }}>Product</th>
            <th style={{ ...S.th, width: 75 }}>Status</th>
            <th style={{ ...S.th, width: 100 }}>Infographics</th>
            <th style={{ ...S.th, width: 100 }}>Product Copy</th>
            <th style={{ ...S.th, width: 100 }}>A+ Content</th>
            <th style={{ ...S.th, width: 130 }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {trackedProducts.map(p => {
            const e = edits[p.id] || {}
            const cr = p.creative || {}
            return (
              <tr key={p.id} style={S.pRow}>
                <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 10 }}>
                  <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer"
                    style={{ color: '#4a6cf7', textDecoration: 'none' }}>{p.id}</a>
                  {saving[p.id] && <span style={{ marginLeft: 4, fontSize: 9, color: '#f59e0b' }}>saving…</span>}
                </td>
                <td style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>{p.title}</td>
                <td style={S.td}><Pill label={p.status} /></td>
                {[
                  { field: 'cr_inf', fallback: cr.inf },
                  { field: 'cr_copy', fallback: cr.copy },
                  { field: 'cr_aplus', fallback: cr.aplus },
                ].map(({ field, fallback }) => {
                  const cur = e[field] || fallback || ''
                  const s = CR_COLORS[cur] || {}
                  return (
                    <td key={field} style={S.td}>
                      <select
                        value={e[field] || fallback || ''}
                        onChange={ev => updateEdit(p.id, { [field]: ev.target.value })}
                        style={{
                          ...S.inlineSelect, minWidth: 90,
                          background: s.bg || '#f9fafb', color: s.color || '#333',
                          fontWeight: 600,
                        }}
                      >
                        <option value="">—</option>
                        {CR_OPTIONS_FULL.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                })}
                <td style={S.td}>
                  <textarea defaultValue={e.notes || ''} placeholder="Note…" rows={1}
                    onBlur={ev => updateEdit(p.id, { notes: ev.target.value })} style={S.noteArea} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState('master')
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    fetchAllEdits().then(data => {
      setEdits(data)
      setLoading(false)
      setLastSync(new Date().toLocaleTimeString())
    })
  }, [])

  const activeProducts = stats.active
  const totalProducts = stats.total

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.5px' }}>⛵ Pendleton · Amazon Dashboard</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Avenue7 Media · Generated: {CATALOG.generated}</div>
        </div>
        <div style={{ flex: 1 }} />
        {loading
          ? <span style={{ fontSize: 11, color: '#f59e0b' }}>Loading edits…</span>
          : <span style={{ fontSize: 11, color: '#6ee7b7' }}>✓ Synced {lastSync}</span>}
      </div>

      {/* Stats */}
      <div style={S.statsBar}>
        {[
          { v: totalProducts, l: 'Parent Products' },
          { v: activeProducts, l: 'Active' },
          { v: stats.inactive, l: 'Inactive/Removed' },
          { v: stats.f26_live, l: 'F26 Live' },
          { v: stats.f26_pending, l: 'F26 Pending' },
          { v: stats.creative, l: 'Creative Tracked' },
        ].map(({ v, l }) => (
          <div key={l} style={S.statCard}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>{v}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {[
          { id: 'master', label: '📋 Master Catalog' },
          { id: 'f26', label: '📦 F26 Launches' },
          { id: 'creative', label: '🎨 Creative Tracker' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tabBtn, ...(tab === t.id ? S.tabBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#888', alignSelf: 'center', paddingRight: 16 }}>
          Edits auto-save to cloud ✦
        </span>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1 }}>
        {tab === 'master' && <MasterTab edits={edits} setEdits={setEdits} />}
        {tab === 'f26' && <F26Tab edits={edits} setEdits={setEdits} />}
        {tab === 'creative' && <CreativeTab edits={edits} setEdits={setEdits} />}
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  header: {
    background: '#1a1a2e', color: '#fff', padding: '12px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
    position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.3)'
  },
  statsBar: {
    background: '#fff', borderBottom: '1px solid #e5e7eb',
    padding: '10px 20px', display: 'flex', gap: 12, flexWrap: 'wrap'
  },
  statCard: {
    background: '#f8f9ff', borderRadius: 8, padding: '8px 16px', textAlign: 'center'
  },
  tabBar: {
    background: '#fff', borderBottom: '2px solid #e5e7eb',
    padding: '0 16px', display: 'flex', gap: 4, position: 'sticky', top: 52, zIndex: 90
  },
  tabBtn: {
    border: 'none', borderBottom: '2px solid transparent', background: 'transparent',
    padding: '10px 16px', fontWeight: 600, fontSize: 13, color: '#666',
    cursor: 'pointer', marginBottom: -2, transition: 'all .15s'
  },
  tabBtnActive: {
    color: '#4a6cf7', borderBottomColor: '#4a6cf7'
  },
  toolbar: {
    background: '#fff', borderBottom: '1px solid #eee',
    padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    position: 'sticky', top: 100, zIndex: 80
  },
  searchBox: {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px',
    fontSize: 12, width: 230, outline: 'none'
  },
  sel: {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 8px',
    fontSize: 12, background: '#fff', cursor: 'pointer'
  },
  cbLabel: { fontSize: 11, color: '#555', display: 'flex', alignItems: 'center', gap: 4 },
  btnGray: {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px',
    fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#444'
  },
  table: {
    borderCollapse: 'collapse', width: '100%', minWidth: 1100,
    background: '#fff', borderRadius: 8, overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,.08)'
  },
  th: {
    background: '#1a1a2e', color: '#fff', padding: '7px 8px',
    textAlign: 'left', fontSize: 11, fontWeight: 600,
    whiteSpace: 'nowrap', position: 'sticky', top: 0
  },
  td: {
    padding: '5px 8px', verticalAlign: 'middle', fontSize: 12,
    borderBottom: '1px solid #f0f0f0'
  },
  pRow: { background: '#fff' },
  catRow: {
    background: '#e8ecff', padding: '5px 10px',
    fontWeight: 700, fontSize: 11, color: '#1a1a2e',
    textTransform: 'uppercase', letterSpacing: '.5px',
    borderTop: '2px solid #c5ceff'
  },
  expandBtn: {
    width: 20, height: 20, borderRadius: 3, border: '1px solid #d1d5db',
    background: '#f9fafb', fontSize: 9, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', color: '#666'
  },
  noteArea: {
    width: '100%', border: '1px solid #e5e7eb', borderRadius: 4,
    padding: '3px 6px', fontSize: 11, resize: 'none', minHeight: 26,
    fontFamily: 'inherit', outline: 'none'
  },
  inlineSelect: {
    border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 5px',
    fontSize: 11, width: '100%', outline: 'none'
  },
  crSelect: {
    border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 4px',
    fontSize: 10, width: '100%', outline: 'none', background: '#fafafa'
  },
  flagBtn: {
    width: 26, height: 22, borderRadius: 4, border: '1px solid #e5e7eb',
    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: '#1a1a2e',
    marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e5e7eb'
  },
}
