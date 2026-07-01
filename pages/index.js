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
  Done:        { bg: '#dcfce7', color: '#166534',  hex: '#22c55e' },
  Uploading:   { bg: '#fef9c3', color: '#854d0e',  hex: '#f59e0b' },
  'In Progress':{ bg: '#dbeafe', color: '#1e40af', hex: '#3b82f6' },
  Pending:     { bg: '#f1f5f9', color: '#64748b',  hex: '#9ca3af' },
  'N/A':       { bg: '#f3f4f6', color: '#9ca3af',  hex: '#d1d5db' },
}
const CR_OPTIONS = ['', 'Done', 'Uploading', 'In Progress', 'Pending', 'N/A']
const OVERRIDE_OPTIONS = ['', 'Needs Attention', 'Optimized', 'Pending Update', 'In Review', 'Done']
const TYPE_OPTIONS = ['New Style', 'New Variation', 'New Towel', 'Other']

function Pill({ label }) {
  const s = STATUS_COLORS[label] || { bg: '#f1f5f9', color: '#64748b' }
  return <span style={{ display:'inline-block', borderRadius:10, padding:'2px 8px', fontSize:10, fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{label}</span>
}
function CrChip({ label, val }) {
  const s = CR_COLORS[val] || { bg: '#f3f4f6', color: '#9ca3af' }
  return <span style={{ display:'inline-block', borderRadius:4, padding:'1px 5px', fontSize:9, fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{label}: {val||'—'}</span>
}
function Check({ ok }) {
  return <span style={{ color: ok ? '#22c55e' : '#d1d5db', fontSize:13 }}>{ok ? '✓' : '–'}</span>
}
function JiraLink({ ticket }) {
  if (!ticket) return null
  return (
    <a href={`https://avenue7media.atlassian.net/browse/${ticket}`} target="_blank" rel="noreferrer"
      style={{ background:'#e0e7ff', color:'#3730a3', borderRadius:4, padding:'2px 6px', fontSize:10, fontWeight:600, textDecoration:'none', display:'inline-block' }}>
      {ticket}
    </a>
  )
}

// Donut chart
function DonutChart({ data, size = 90 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <div style={{ width:size, height:size, borderRadius:'50%', background:'#f3f4f6' }} />
  const r = 28, cx = size/2, cy = size/2, circ = 2*Math.PI*r
  let cumulative = 0
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={11} />
        {data.map((d, i) => {
          const dash = (d.value / total) * circ
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.hex} strokeWidth={11}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-(cumulative - circ / 4)}
              style={{ transition: 'stroke-dasharray .4s' }}
            />
          )
          cumulative += dash
          return el
        })}
        <text x={cx} y={cy-4} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={800} fill="#1a1a2e">{total}</text>
        <text x={cx} y={cy+10} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#888">total</text>
      </svg>
    </div>
  )
}

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ── Side Action Panel ─────────────────────────────────────────────────────────
function SidePanel({ product, edits, setEdits, onClose }) {
  const debouncedUpsert = useDebouncedCallback(upsertEdit, 600)
  const debouncedNote  = useDebouncedCallback((asin, notes) => upsertEdit(asin, { notes }), 700)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setSaved(false) }, [product?.id])

  if (!product) return null
  const e = edits[product.id] || {}
  const cr = product.creative || {}

  function upd(patch) {
    setEdits(prev => ({ ...prev, [product.id]: { ...(prev[product.id]||{}), asin: product.id, ...patch } }))
    debouncedUpsert(product.id, patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const crFields = [
    { key: 'cr_inf',   label: 'Infographics', fallback: cr.inf },
    { key: 'cr_copy',  label: 'Product Copy',  fallback: cr.copy },
    { key: 'cr_aplus', label: 'A+ Content',    fallback: cr.aplus },
  ]

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:190 }} />
      {/* Panel */}
      <div style={{ position:'fixed', right:0, top:0, bottom:0, width:390, background:'#fff',
        boxShadow:'-8px 0 40px rgba(0,0,0,.18)', zIndex:200, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0f172a,#1e1b4b)', color:'#fff', padding:'16px 18px', display:'flex', alignItems:'flex-start', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:14, lineHeight:1.3 }}>{product.title}</div>
            <div style={{ fontSize:10, color:'#aaa', fontFamily:'monospace', marginTop:4 }}>{product.id}</div>
            <div style={{ marginTop:6 }}><Pill label={product.status} /></div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:6, width:28, height:28, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding:'16px', flex:1, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Owner */}
          <div style={SP.section}>
            <div style={SP.label}>Assigned To</div>
            <select value={e.owner||''} onChange={ev=>upd({owner:ev.target.value})} style={SP.select}>
              {OWNERS.map(o=><option key={o} value={o===OWNERS[0]?'':o}>{o}</option>)}
            </select>
          </div>

          {/* My Status */}
          <div style={SP.section}>
            <div style={SP.label}>My Status</div>
            <select value={e.status_override||''} onChange={ev=>upd({status_override:ev.target.value})} style={SP.select}>
              {OVERRIDE_OPTIONS.map(o=><option key={o} value={o}>{o||'— not set'}</option>)}
            </select>
          </div>

          {/* Creative Status */}
          <div style={SP.section}>
            <div style={SP.label}>Creative Status</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {crFields.map(({ key, label, fallback }) => {
                const cur = e[key] || fallback || ''
                const cs = CR_COLORS[cur] || {}
                return (
                  <div key={key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:100, fontSize:11, color:'#555', flexShrink:0 }}>{label}</span>
                    <select value={e[key]||fallback||''} onChange={ev=>upd({[key]:ev.target.value})}
                      style={{ ...SP.select, flex:1, background:cs.bg||'#fafafa', color:cs.color||'#333', fontWeight:cur?700:400 }}>
                      <option value="">—</option>
                      {['Done','Uploading','In Progress','Pending','N/A'].map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Jira */}
          <div style={SP.section}>
            <div style={SP.label}>Jira Ticket</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input placeholder="e.g. CREATE-123" defaultValue={e.jira_ticket||product.jira?.epic||''}
                onBlur={ev=>upd({jira_ticket:ev.target.value})}
                style={{ ...SP.input, flex:1 }} />
              {(e.jira_ticket||product.jira?.epic) &&
                <JiraLink ticket={e.jira_ticket||product.jira?.epic} />}
            </div>
          </div>

          {/* Notes */}
          <div style={SP.section}>
            <div style={SP.label}>Notes</div>
            <textarea defaultValue={e.notes||''} rows={4}
              onChange={ev=>debouncedNote(product.id, ev.target.value)}
              placeholder="Add notes, action items, context…"
              style={{ ...SP.input, resize:'vertical', minHeight:80, lineHeight:1.5 }} />
          </div>

          {/* Flags */}
          <div style={SP.section}>
            <div style={SP.label}>Flag</div>
            <div style={{ display:'flex', gap:8 }}>
              {[['red','🔴','Flag'],['blue','🔵','Watch'],['star','⭐','Priority']].map(([f,emoji,tip])=>(
                <button key={f} title={tip} onClick={()=>upd({[`flag_${f}`]:!e[`flag_${f}`]})}
                  style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'2px solid',
                    borderColor: e[`flag_${f}`]?'#818cf8':'#e5e7eb',
                    background: e[`flag_${f}`]?'#e0e7ff':'#f9fafb',
                    fontSize:18, cursor:'pointer' }}>
                  {emoji}<div style={{ fontSize:10, color:'#555', marginTop:2 }}>{tip}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Optimization snapshot */}
          <div style={SP.section}>
            <div style={SP.label}>Optimization</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {[['Bullets',product.bi],['Description',product.di],['Main Image',product.mi],['Gallery',product.ii]].map(([l,v])=>(
                <div key={l} style={{ background:v?'#dcfce7':'#fee2e2', borderRadius:6, padding:'6px 10px', display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                  <span style={{ fontSize:13 }}>{v?'✓':'✗'}</span> {l}
                </div>
              ))}
            </div>
          </div>

          {/* Amazon link */}
          <a href={`https://www.amazon.com/dp/${product.id}`} target="_blank" rel="noreferrer"
            style={{ textAlign:'center', background:'#ff9900', color:'#fff', borderRadius:8, padding:'10px', fontWeight:700, fontSize:12, textDecoration:'none', display:'block' }}>
            🛒 View on Amazon
          </a>
        </div>

        {/* Save status */}
        {saved && (
          <div style={{ position:'sticky', bottom:0, background:'#dcfce7', color:'#166534', padding:'8px 16px', fontSize:11, fontWeight:600, textAlign:'center' }}>
            ✓ Saved
          </div>
        )}
      </div>
    </>
  )
}

const SP = {
  section: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.8px', color:'#9ca3af' },
  select: { border:'1px solid #e5e7eb', borderRadius:6, padding:'7px 10px', fontSize:12, outline:'none', width:'100%' },
  input: { border:'1px solid #e5e7eb', borderRadius:6, padding:'7px 10px', fontSize:12, outline:'none', width:'100%', fontFamily:'inherit' },
}

// ── Category Sidebar ──────────────────────────────────────────────────────────
function CategorySidebar({ cats, products, catFilter, setCatFilter }) {
  const [open, setOpen] = useState(false)
  const counts = {}
  products.forEach(p => { counts[p.cat] = (counts[p.cat]||0) + 1 })
  const initials = c => c.split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2)
  return (
    <div
      onMouseEnter={()=>setOpen(true)}
      onMouseLeave={()=>setOpen(false)}
      style={{
        width: open ? 196 : 46, minHeight:'100%',
        background:'#0f172a', transition:'width .2s ease',
        overflow:'hidden', flexShrink:0,
        position:'sticky', top:112, alignSelf:'flex-start',
        borderRight:'1px solid rgba(255,255,255,.06)', zIndex:70,
      }}
    >
      {/* All */}
      <div onClick={()=>setCatFilter('')}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 13px', cursor:'pointer',
          background: !catFilter ? 'linear-gradient(90deg,#6366f1,#4f46e5)' : 'transparent',
          color: !catFilter ? '#fff' : '#64748b', fontSize:11, fontWeight:700,
          borderBottom:'1px solid rgba(255,255,255,.05)', whiteSpace:'nowrap' }}>
        <span style={{minWidth:20,textAlign:'center',fontSize:12}}>☰</span>
        {open && <span>All Categories</span>}
      </div>
      {cats.map(c=>(
        <div key={c} onClick={()=>setCatFilter(catFilter===c?'':c)} className="sidebar-item"
          style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 13px', cursor:'pointer',
            background: catFilter===c ? 'rgba(99,102,241,.2)' : 'transparent',
            color: catFilter===c ? '#c7d2fe' : '#64748b',
            fontSize:11, fontWeight:600, whiteSpace:'nowrap',
            borderBottom:'1px solid rgba(255,255,255,.04)',
            transition:'background .15s,color .15s',
            borderLeft: catFilter===c ? '3px solid #6366f1' : '3px solid transparent' }}>
          <span style={{minWidth:20,textAlign:'center',fontSize:10,background:'rgba(255,255,255,.07)',borderRadius:4,padding:'2px 3px',flexShrink:0}}>{initials(c)}</span>
          {open && <><span style={{flex:1}}>{c}</span><span style={{fontSize:10,color:'#6366f1',fontWeight:800}}>{counts[c]||0}</span></>}
        </div>
      ))}
    </div>
  )
}

// ── Supabase ─────────────────────────────────────────────────────────────────
async function fetchAllEdits() {
  const { data, error } = await supabase.from('pendleton_edits').select('*')
  if (error) { console.error(error); return {} }
  const map = {}
  data.forEach(r => { map[r.asin] = r })
  return map
}
async function upsertEdit(asin, patch) {
  const { error } = await supabase.from('pendleton_edits').upsert(
    { asin, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'asin' }
  )
  if (error) console.error('Save error:', error)
}
async function fetchNewProducts() {
  const { data, error } = await supabase.from('pendleton_new_products').select('*').order('created_at')
  if (error) { console.error(error); return [] }
  return data || []
}
async function insertNewProduct(row) {
  const { data, error } = await supabase.from('pendleton_new_products').insert(row).select().single()
  if (error) { console.error(error); return null }
  return data
}
async function updateNewProduct(id, patch) {
  const { error } = await supabase.from('pendleton_new_products').update(patch).eq('id', id)
  if (error) console.error(error)
}
async function deleteNewProduct(id) {
  const { error } = await supabase.from('pendleton_new_products').delete().eq('id', id)
  if (error) console.error(error)
}

// ── MASTER TAB ───────────────────────────────────────────────────────────────
function MasterTab({ edits, setEdits, onOpenPanel }) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [f26Only, setF26Only] = useState(false)
  const [crOnly, setCrOnly] = useState(false)
  const [flagOnly, setFlagOnly] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [saving, setSaving] = useState({})

  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s => ({ ...s, [asin]: true }))
    await upsertEdit(asin, patch)
    setSaving(s => { const n={...s}; delete n[asin]; return n })
  }, 700)
  // Notes-specific debounce — saves to Supabase as you type, no state churn
  const debouncedNoteSave = useDebouncedCallback((asin, notes) => upsertEdit(asin, { notes }), 800)

  function updateEdit(asin, patch) {
    setEdits(prev => ({ ...prev, [asin]: { ...(prev[asin]||{}), asin, ...patch } }))
    debouncedUpsert(asin, patch)
  }
  function toggleExpand(id) {
    setExpanded(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
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
      const hay = `${p.title} ${p.id} ${p.pg} ${(p.children||[]).map(c=>c.asin+' '+c.sku).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Pin starred to top, rest grouped by category
  const starred = filtered.filter(p => (edits[p.id]||{}).flag_star)
  const unstarred = filtered.filter(p => !(edits[p.id]||{}).flag_star)

  const grouped = []
  if (starred.length) {
    grouped.push({ type:'cat', cat:'⭐ Pinned' })
    starred.forEach(p => grouped.push({ type:'product', p }))
  }
  let curCat = null
  unstarred.forEach(p => {
    if (p.cat !== curCat) { grouped.push({ type:'cat', cat:p.cat }); curCat=p.cat }
    grouped.push({ type:'product', p })
  })

  return (
    <div style={{ display:'flex' }}>
      <CategorySidebar cats={cats} products={products} catFilter={catFilter} setCatFilter={setCatFilter} />
      <div style={{ flex:1, minWidth:0 }}>
      <div style={S.toolbar}>
        <input style={S.searchBox} placeholder="Search product, ASIN, SKU…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={S.sel} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select style={S.sel} value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}>
          <option value="">All Depts</option>
          {depts.filter(Boolean).map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <select style={S.sel} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <label style={S.cbLabel}><input type="checkbox" checked={f26Only} onChange={e=>setF26Only(e.target.checked)} /> F26 Only</label>
        <label style={S.cbLabel}><input type="checkbox" checked={crOnly} onChange={e=>setCrOnly(e.target.checked)} /> Has Creative</label>
        <label style={S.cbLabel}><input type="checkbox" checked={flagOnly} onChange={e=>setFlagOnly(e.target.checked)} /> Flagged</label>
        <div style={{flex:1}} />
        <span style={{fontSize:11,color:'#888'}}>{filtered.length} products</span>
        <button style={S.btnGray} onClick={()=>setExpanded(new Set(products.map(p=>p.id)))}>Expand All</button>
        <button style={S.btnGray} onClick={()=>setExpanded(new Set())}>Collapse</button>
      </div>
      <div style={{ overflowX:'auto', padding:'0 16px 24px' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{...S.th,width:28}}></th>
              <th style={{...S.th,width:110}}>ASIN</th>
              <th style={{...S.th,width:220}}>Product</th>
              <th style={{...S.th,width:65}}>Dept</th>
              <th style={{...S.th,width:75}}>Amazon Status</th>
              <th style={{...S.th,width:90}}>My Status</th>
              <th style={{...S.th,width:50}}>Price</th>
              <th style={{...S.th,width:40}}>SKUs</th>
              <th style={{...S.th,width:195}}>Optimization</th>
              <th style={{...S.th,width:95}}>F26</th>
              <th style={{...S.th,width:125}}>Creative Status</th>
              <th style={{...S.th,width:140}}>Notes</th>
              <th style={{...S.th,width:80}}>Flag</th>
              <th style={{...S.th,width:36}}></th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((item, i) => {
              if (item.type === 'cat') return (
                <tr key={`cat-${i}`}><td colSpan={13} style={item.cat.startsWith('⭐') ? S.pinnedRow : S.catRow}>{item.cat}</td></tr>
              )
              const { p } = item
              const e = edits[p.id] || {}
              const isExp = expanded.has(p.id)
              const hasChildren = (p.children||[]).length > 0
              return [
                <tr key={p.id} className="p-row" style={S.pRow}>
                  <td style={{...S.td,textAlign:'center',padding:'4px 4px'}}>
                    {hasChildren && <button onClick={()=>toggleExpand(p.id)} style={S.expandBtn}>{isExp?'▾':'▸'}</button>}
                  </td>
                  <td style={{...S.td,fontFamily:'monospace',fontSize:10}}>
                    <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer" style={{color:'#4a6cf7',textDecoration:'none'}}>{p.id}</a>
                    {saving[p.id] && <span style={{marginLeft:4,fontSize:9,color:'#f59e0b'}}>saving…</span>}
                  </td>
                  <td style={{...S.td,fontWeight:600,fontSize:12}}>{p.title||'—'}</td>
                  <td style={{...S.td,fontSize:11,color:'#555'}}>{p.dept||'—'}</td>
                  <td style={S.td}><Pill label={p.status} /></td>
                  <td style={S.td}>
                    <select value={e.status_override||''} onChange={ev=>updateEdit(p.id,{status_override:ev.target.value})}
                      style={{...S.inlineSelect,background:e.status_override?'#ede9fe':'#fff',color:e.status_override?'#6d28d9':'#666'}}>
                      {OVERRIDE_OPTIONS.map(o=><option key={o} value={o}>{o||'— set status'}</option>)}
                    </select>
                  </td>
                  <td style={{...S.td,fontSize:11}}>{p.price!=null?`$${p.price}`:'—'}</td>
                  <td style={{...S.td,textAlign:'center',fontSize:11}}>{p.n}</td>
                  <td style={{...S.td,fontSize:10}}>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <span><Check ok={p.bi}/> Bullets</span>
                      <span><Check ok={p.di}/> Desc</span>
                      <span><Check ok={p.mi}/> Main Img</span>
                      <span><Check ok={p.ii}/> Gallery</span>
                    </div>
                  </td>
                  <td style={S.td}>
                    {p.f26 ? <div>
                      <span style={{display:'inline-block',borderRadius:10,padding:'2px 7px',fontSize:10,fontWeight:700,background:p.f26.type==='New Variation'?'#ede9fe':'#fef3c7',color:p.f26.type==='New Variation'?'#6d28d9':'#92400e'}}>{p.f26.type==='New Variation'?'New Var':'New Style'}</span>
                      {p.f26.launch&&<div style={{fontSize:9,color:'#888',marginTop:2}}>{p.f26.launch}</div>}
                    </div> : '—'}
                  </td>
                  <td style={S.td}>
                    {p.creative ? (
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <CrChip label="Inf" val={e.cr_inf||p.creative.inf} />
                        <CrChip label="Copy" val={e.cr_copy||p.creative.copy} />
                        <CrChip label="A+" val={e.cr_aplus||p.creative.aplus} />
                      </div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <select value={e.cr_inf||''} onChange={ev=>updateEdit(p.id,{cr_inf:ev.target.value})} style={S.crSelect}>{CR_OPTIONS.map(o=><option key={o} value={o}>{o||'Inf…'}</option>)}</select>
                        <select value={e.cr_copy||''} onChange={ev=>updateEdit(p.id,{cr_copy:ev.target.value})} style={S.crSelect}>{CR_OPTIONS.map(o=><option key={o} value={o}>{o||'Copy…'}</option>)}</select>
                        <select value={e.cr_aplus||''} onChange={ev=>updateEdit(p.id,{cr_aplus:ev.target.value})} style={S.crSelect}>{CR_OPTIONS.map(o=><option key={o} value={o}>{o||'A+…'}</option>)}</select>
                      </div>
                    )}
                  </td>
                  <td style={S.td}>
                    <textarea defaultValue={e.notes||''} placeholder="Add note…" rows={1}
                      onChange={ev=>debouncedNoteSave(p.id, ev.target.value)}
                      style={S.noteArea} />
                  </td>
                  <td style={{...S.td,padding:'4px 6px'}}>
                    <div style={{display:'flex',gap:3}}>
                      {[['red','🔴'],['blue','🔵'],['star','⭐']].map(([f,emoji])=>(
                        <button key={f} onClick={()=>updateEdit(p.id,{[`flag_${f}`]:!e[`flag_${f}`]})}
                          style={{...S.flagBtn,background:e[`flag_${f}`]?'#e0e7ff':'#f9fafb',borderColor:e[`flag_${f}`]?'#818cf8':'#e5e7eb'}}>{emoji}</button>
                      ))}
                    </div>
                  </td>
                  <td style={{...S.td,padding:'4px 6px',textAlign:'center'}}>
                    <button onClick={()=>onOpenPanel(p)} title="Edit in panel" className="panel-btn"
                      style={{background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:6,width:28,height:28,color:'#6366f1',fontSize:12,display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}}>✏️</button>
                  </td>
                </tr>,
                ...((p.children||[]).map(c=>(
                  <tr key={c.asin} style={{display:isExp?'table-row':'none',background:'#f8faff'}}>
                    <td style={S.td}></td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:10,paddingLeft:20}}>
                      <a href={`https://www.amazon.com/dp/${c.asin}`} target="_blank" rel="noreferrer" style={{color:'#4a6cf7',textDecoration:'none'}}>{c.asin}</a>
                    </td>
                    <td style={{...S.td,fontSize:11,color:'#555',paddingLeft:24}}>{c.title||c.sku}</td>
                    <td style={S.td}></td>
                    <td style={S.td}><Pill label={c.status}/></td>
                    <td style={S.td}></td>
                    <td style={{...S.td,fontSize:11}}>{c.price!=null?`$${c.price}`:'—'}</td>
                    <td style={S.td}></td>
                    <td style={{...S.td,fontSize:10}}>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <span><Check ok={c.bi}/> Bullets</span><span><Check ok={c.di}/> Desc</span>
                        <span><Check ok={c.mi}/> Main</span><span><Check ok={c.ii}/> Gallery</span>
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
    </div>
  )
}

// ── F26 TAB ───────────────────────────────────────────────────────────────────
function F26Tab({ edits, setEdits }) {
  const [newProducts, setNewProducts] = useState([])
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState({ name:'', type:'New Style', launch_date:'', cr_inf:'', cr_copy:'', cr_aplus:'', jira_ticket:'', notes:'' })
  const [saving, setSaving] = useState({})

  useEffect(() => { fetchNewProducts().then(setNewProducts) }, [])

  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s=>({...s,[asin]:true}))
    await upsertEdit(asin, patch)
    setSaving(s=>{const n={...s};delete n[asin];return n})
  }, 700)

  // For F26 catalog items (have ASINs) — use edits table with jira_ticket field
  function updateEdit(asin, patch) {
    setEdits(prev=>({...prev,[asin]:{...(prev[asin]||{}),asin,...patch}}))
    debouncedUpsert(asin, patch)
  }

  // For manually added new products
  async function updateNewRow(id, patch) {
    setNewProducts(prev => prev.map(r => r.id===id ? {...r,...patch} : r))
    await updateNewProduct(id, patch)
  }
  async function deleteRow(id) {
    if (!confirm('Delete this product?')) return
    await deleteNewProduct(id)
    setNewProducts(prev => prev.filter(r => r.id !== id))
  }
  async function submitNewRow() {
    if (!newRow.name.trim()) return
    const saved = await insertNewProduct(newRow)
    if (saved) { setNewProducts(prev=>[...prev, saved]); setAddingRow(false); setNewRow({name:'',type:'New Style',launch_date:'',cr_inf:'',cr_copy:'',cr_aplus:'',jira_ticket:'',notes:''}) }
  }

  const liveF26 = products.filter(p => p.f26)
  const CR_OPTS = ['', 'Done', 'Uploading', 'In Progress', 'Pending', 'N/A']

  // All pending rows: baked-in from catalog data + manually added
  const allPending = [
    ...f26_new.map(r => ({ _source: 'catalog', ...r })),
    ...newProducts.map(r => ({ _source: 'manual', ...r })),
  ]

  return (
    <div style={{ padding:'16px 16px 32px' }}>
      {/* Pending */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <h2 style={{...S.sectionTitle, marginBottom:0}}>📦 Pending — New Listings Not Yet Created</h2>
        <button onClick={()=>setAddingRow(true)} style={{...S.btnBlue, fontSize:12}}>+ Add Product</button>
      </div>
      <table style={{...S.table, marginBottom:32}}>
        <thead>
          <tr>
            <th style={{...S.th,width:240}}>Product Name</th>
            <th style={{...S.th,width:90}}>Type</th>
            <th style={{...S.th,width:110}}>Launch Date</th>
            <th style={{...S.th,width:90}}>Infographics</th>
            <th style={{...S.th,width:90}}>Copy</th>
            <th style={{...S.th,width:90}}>A+ Content</th>
            <th style={{...S.th,width:150}}>Jira Ticket</th>
            <th style={{...S.th,width:30}}></th>
          </tr>
        </thead>
        <tbody>
          {allPending.map((r, i) => {
            const isCatalog = r._source === 'catalog'
            const key = isCatalog ? `cat_${i}` : r.id
            return (
              <tr key={key} className="p-row" style={S.pRow}>
                <td style={{...S.td,fontWeight:600}}>{r.name||'—'}</td>
                <td style={S.td}>
                  {isCatalog ? (
                    <span style={{display:'inline-block',borderRadius:10,padding:'2px 8px',fontSize:10,fontWeight:700,background:r.type==='New Towel'?'#fef3c7':'#ede9fe',color:r.type==='New Towel'?'#92400e':'#6d28d9'}}>{r.type}</span>
                  ) : (
                    <select value={r.type||'New Style'} onChange={ev=>updateNewRow(r.id,{type:ev.target.value})} style={S.crSelect}>
                      {TYPE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </td>
                <td style={{...S.td,fontSize:11}}>
                  {isCatalog ? (r.launch||'—') : (
                    <input type="date" value={r.launch_date||''} onChange={ev=>updateNewRow(r.id,{launch_date:ev.target.value})}
                      style={{...S.inlineSelect,width:120}} />
                  )}
                </td>
                {/* Inf */}
                <td style={S.td}>
                  <select value={isCatalog?(r.cr?.inf||''):(r.cr_inf||'')}
                    onChange={ev=>isCatalog?null:updateNewRow(r.id,{cr_inf:ev.target.value})}
                    disabled={isCatalog && !!r.cr?.inf}
                    style={{...S.crSelect,...(((isCatalog?r.cr?.inf:r.cr_inf))?(CR_COLORS[isCatalog?r.cr?.inf:r.cr_inf]||{}):{}),...(isCatalog&&r.cr?.inf?{background:CR_COLORS[r.cr.inf]?.bg,color:CR_COLORS[r.cr.inf]?.color,fontWeight:700}:{})}}>
                    <option value="">Inf…</option>
                    {CR_OPTS.filter(Boolean).map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                {/* Copy */}
                <td style={S.td}>
                  <select value={isCatalog?(r.cr?.copy||''):(r.cr_copy||'')}
                    onChange={ev=>isCatalog?null:updateNewRow(r.id,{cr_copy:ev.target.value})}
                    disabled={isCatalog && !!r.cr?.copy}
                    style={{...S.crSelect,...(isCatalog&&r.cr?.copy?{background:CR_COLORS[r.cr.copy]?.bg,color:CR_COLORS[r.cr.copy]?.color,fontWeight:700}:{})}}>
                    <option value="">Copy…</option>
                    {CR_OPTS.filter(Boolean).map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                {/* A+ */}
                <td style={S.td}>
                  <select value={isCatalog?(r.cr?.aplus||''):(r.cr_aplus||'')}
                    onChange={ev=>isCatalog?null:updateNewRow(r.id,{cr_aplus:ev.target.value})}
                    disabled={isCatalog && !!r.cr?.aplus}
                    style={{...S.crSelect,...(isCatalog&&r.cr?.aplus?{background:CR_COLORS[r.cr.aplus]?.bg,color:CR_COLORS[r.cr.aplus]?.color,fontWeight:700}:{})}}>
                    <option value="">A+…</option>
                    {CR_OPTS.filter(Boolean).map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                {/* Jira */}
                <td style={S.td}>
                  {isCatalog ? (
                    r.jira?.epic ? <JiraLink ticket={r.jira.epic} /> : '—'
                  ) : (
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <input placeholder="e.g. CREATE-123" value={r.jira_ticket||''}
                        onChange={ev=>updateNewRow(r.id,{jira_ticket:ev.target.value})}
                        style={{...S.inlineSelect,width:110}} />
                      {r.jira_ticket && <JiraLink ticket={r.jira_ticket} />}
                    </div>
                  )}
                </td>
                <td style={{...S.td,textAlign:'center'}}>
                  {!isCatalog && (
                    <button onClick={()=>deleteRow(r.id)} style={{border:'none',background:'none',color:'#e5e7eb',cursor:'pointer',fontSize:14}} title="Delete">✕</button>
                  )}
                </td>
              </tr>
            )
          })}

          {/* Add new row inline */}
          {addingRow && (
            <tr style={{background:'#f0f9ff'}}>
              <td style={S.td}>
                <input autoFocus placeholder="Product name *" value={newRow.name} onChange={e=>setNewRow(p=>({...p,name:e.target.value}))}
                  style={{...S.inlineSelect,width:'100%'}} />
              </td>
              <td style={S.td}>
                <select value={newRow.type} onChange={e=>setNewRow(p=>({...p,type:e.target.value}))} style={S.crSelect}>
                  {TYPE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td style={S.td}>
                <input type="date" value={newRow.launch_date} onChange={e=>setNewRow(p=>({...p,launch_date:e.target.value}))}
                  style={{...S.inlineSelect,width:120}} />
              </td>
              <td style={S.td}><select value={newRow.cr_inf} onChange={e=>setNewRow(p=>({...p,cr_inf:e.target.value}))} style={S.crSelect}>{CR_OPTS.map(o=><option key={o} value={o}>{o||'Inf…'}</option>)}</select></td>
              <td style={S.td}><select value={newRow.cr_copy} onChange={e=>setNewRow(p=>({...p,cr_copy:e.target.value}))} style={S.crSelect}>{CR_OPTS.map(o=><option key={o} value={o}>{o||'Copy…'}</option>)}</select></td>
              <td style={S.td}><select value={newRow.cr_aplus} onChange={e=>setNewRow(p=>({...p,cr_aplus:e.target.value}))} style={S.crSelect}>{CR_OPTS.map(o=><option key={o} value={o}>{o||'A+…'}</option>)}</select></td>
              <td style={S.td}><input placeholder="CREATE-123" value={newRow.jira_ticket} onChange={e=>setNewRow(p=>({...p,jira_ticket:e.target.value}))} style={{...S.inlineSelect,width:110}} /></td>
              <td style={{...S.td,textAlign:'center'}}>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={submitNewRow} style={{...S.btnBlue,padding:'3px 8px',fontSize:11}}>✓</button>
                  <button onClick={()=>setAddingRow(false)} style={{...S.btnGray,padding:'3px 8px',fontSize:11}}>✕</button>
                </div>
              </td>
            </tr>
          )}

          {allPending.length === 0 && !addingRow && (
            <tr><td colSpan={8} style={{padding:20,textAlign:'center',color:'#aaa',fontSize:12}}>No pending items — click + Add Product to add one</td></tr>
          )}
        </tbody>
      </table>

      {/* Live F26 */}
      <h2 style={S.sectionTitle}>✅ Live in Catalog — F26 Products</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{...S.th,width:110}}>ASIN</th>
            <th style={{...S.th,width:220}}>Product</th>
            <th style={{...S.th,width:75}}>Status</th>
            <th style={{...S.th,width:90}}>Type</th>
            <th style={{...S.th,width:90}}>Inf</th>
            <th style={{...S.th,width:90}}>Copy</th>
            <th style={{...S.th,width:90}}>A+</th>
            <th style={{...S.th,width:160}}>Jira Ticket</th>
            <th style={{...S.th,width:140}}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {liveF26.map(p => {
            const e = edits[p.id] || {}
            const cr = p.creative || {}
            return (
              <tr key={p.id} className="p-row" style={S.pRow}>
                <td style={{...S.td,fontFamily:'monospace',fontSize:10}}>
                  <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer" style={{color:'#4a6cf7',textDecoration:'none'}}>{p.id}</a>
                  {saving[p.id]&&<span style={{marginLeft:4,fontSize:9,color:'#f59e0b'}}>saving…</span>}
                </td>
                <td style={{...S.td,fontWeight:600,fontSize:12}}>{p.title}</td>
                <td style={S.td}><Pill label={p.status}/></td>
                <td style={S.td}>
                  <span style={{display:'inline-block',borderRadius:10,padding:'2px 7px',fontSize:10,fontWeight:700,background:p.f26.type==='New Variation'?'#ede9fe':'#fef3c7',color:p.f26.type==='New Variation'?'#6d28d9':'#92400e'}}>
                    {p.f26.type==='New Variation'?'New Var':'New Style'}
                  </span>
                </td>
                {[{field:'cr_inf',fb:cr.inf},{field:'cr_copy',fb:cr.copy},{field:'cr_aplus',fb:cr.aplus}].map(({field,fb})=>{
                  const cur = e[field]||fb||''
                  const cs = CR_COLORS[cur]||{}
                  return (
                    <td key={field} style={S.td}>
                      <select value={e[field]||fb||''} onChange={ev=>updateEdit(p.id,{[field]:ev.target.value})}
                        style={{...S.crSelect,minWidth:80,background:cs.bg||'#fafafa',color:cs.color||'#333',fontWeight:cur?700:400}}>
                        <option value="">—</option>
                        {CR_OPTS.filter(Boolean).map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                })}
                <td style={S.td}>
                  <div style={{display:'flex',gap:4,alignItems:'center'}}>
                    <input placeholder="CREATE-123" defaultValue={e.jira_ticket||p.jira?.epic||''}
                      onBlur={ev=>updateEdit(p.id,{jira_ticket:ev.target.value})}
                      style={{...S.inlineSelect,width:100}} />
                    {(e.jira_ticket||p.jira?.epic) && <JiraLink ticket={e.jira_ticket||p.jira?.epic} />}
                  </div>
                </td>
                <td style={S.td}>
                  <textarea defaultValue={e.notes||''} placeholder="Note…" rows={1}
                    onBlur={ev=>updateEdit(p.id,{notes:ev.target.value})} style={S.noteArea} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CREATIVE TAB ──────────────────────────────────────────────────────────────
function CreativeTab({ edits, setEdits, onOpenPanel }) {
  const [saving, setSaving] = useState({})
  const debouncedUpsert = useDebouncedCallback(async (asin, patch) => {
    setSaving(s=>({...s,[asin]:true}))
    await upsertEdit(asin, patch)
    setSaving(s=>{const n={...s};delete n[asin];return n})
  }, 700)
  const debouncedNoteSave = useDebouncedCallback((asin, notes) => upsertEdit(asin, { notes }), 800)

  function updateEdit(asin, patch) {
    setEdits(prev=>({...prev,[asin]:{...(prev[asin]||{}),asin,...patch}}))
    debouncedUpsert(asin, patch)
  }

  const trackedProducts = products.filter(p => p.creative)

  function buildChartData(field) {
    const counts = {}
    trackedProducts.forEach(p => {
      const e = edits[p.id] || {}
      const val = e[`cr_${field}`] || (p.creative?.[field]) || 'Pending'
      counts[val] = (counts[val]||0) + 1
    })
    return Object.entries(counts).map(([label, value]) => ({
      label, value, hex: CR_COLORS[label]?.hex || '#d1d5db', bg: CR_COLORS[label]?.bg, color: CR_COLORS[label]?.color
    })).sort((a,b) => b.value - a.value)
  }

  const infData = buildChartData('inf')
  const copyData = buildChartData('copy')
  const aplusData = buildChartData('aplus')

  return (
    <div style={{ padding:'16px 16px 32px' }}>
      {/* Donut summary cards */}
      <div style={{ display:'flex', gap:16, marginBottom:28, flexWrap:'wrap' }}>
        {[{label:'Infographics',data:infData,accent:'#6366f1'},{label:'Product Copy',data:copyData,accent:'#0ea5e9'},{label:'A+ Content',data:aplusData,accent:'#10b981'}].map(({label,data,accent})=>(
          <div key={label} style={{ background:'#fff', borderRadius:12, padding:'18px 22px', boxShadow:'0 2px 16px rgba(0,0,0,.08)', display:'flex', gap:20, alignItems:'center', minWidth:268, borderTop:`3px solid ${accent}`, flex:1 }}>
            <DonutChart data={data} size={92} />
            <div style={{flex:1}}>
              <div style={{ fontWeight:800, fontSize:12, color:'#0f172a', marginBottom:12, textTransform:'uppercase', letterSpacing:'.6px' }}>{label}</div>
              {data.map(d=>(
                <div key={d.label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:d.hex, display:'inline-block', flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'#64748b', flex:1 }}>{d.label}</span>
                  <span style={{ fontWeight:800, fontSize:13, color:'#0f172a' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <h2 style={S.sectionTitle}>Creative Tracker — {trackedProducts.length} Products</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{...S.th,width:110}}>ASIN</th>
            <th style={{...S.th,width:200}}>Product</th>
            <th style={{...S.th,width:75}}>Status</th>
            <th style={{...S.th,width:95}}>Infographics</th>
            <th style={{...S.th,width:95}}>Product Copy</th>
            <th style={{...S.th,width:95}}>A+ Content</th>
            <th style={{...S.th,width:95}}>Owner</th>
            <th style={{...S.th,width:140}}>Jira Ticket</th>
            <th style={{...S.th,width:160}}>Notes</th>
            <th style={{...S.th,width:36}}></th>
          </tr>
        </thead>
        <tbody>
          {trackedProducts.map(p => {
            const e = edits[p.id] || {}
            const cr = p.creative || {}
            return (
              <tr key={p.id} className="p-row" style={S.pRow}>
                <td style={{...S.td,fontFamily:'monospace',fontSize:10}}>
                  <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer" style={{color:'#6366f1',textDecoration:'none'}}>{p.id}</a>
                  {saving[p.id]&&<span style={{marginLeft:4,fontSize:9,color:'#f59e0b'}}>saving…</span>}
                </td>
                <td style={{...S.td,fontWeight:600,fontSize:12}}>{p.title}</td>
                <td style={S.td}><Pill label={p.status}/></td>
                {[{f:'cr_inf',fb:cr.inf},{f:'cr_copy',fb:cr.copy},{f:'cr_aplus',fb:cr.aplus}].map(({f,fb})=>{
                  const cur = e[f]||fb||''
                  const cs = CR_COLORS[cur]||{}
                  return (
                    <td key={f} style={S.td}>
                      <select value={e[f]||fb||''} onChange={ev=>updateEdit(p.id,{[f]:ev.target.value})}
                        style={{...S.inlineSelect,minWidth:88,background:cs.bg||'#fafafa',color:cs.color||'#333',fontWeight:cur?700:400}}>
                        <option value="">—</option>
                        {['Done','Uploading','In Progress','Pending','N/A'].map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                })}
                <td style={S.td}>
                  <select value={e.owner||''} onChange={ev=>updateEdit(p.id,{owner:ev.target.value})}
                    style={{...S.crSelect,minWidth:88,fontWeight:e.owner?700:400,
                      background:e.owner?'#f5f3ff':'#fafafa',color:e.owner?'#6d28d9':'#94a3b8'}}>
                    <option value="">—</option>
                    {['Resh','Sheila','Vannessa'].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td style={S.td}>
                  <div style={{display:'flex',gap:4,alignItems:'center'}}>
                    <input placeholder="CREATE-123" defaultValue={e.jira_ticket||p.jira?.epic||''}
                      onBlur={ev=>updateEdit(p.id,{jira_ticket:ev.target.value})}
                      style={{...S.inlineSelect,width:96}} />
                    {(e.jira_ticket||p.jira?.epic) && <JiraLink ticket={e.jira_ticket||p.jira?.epic} />}
                  </div>
                </td>
                <td style={S.td}>
                  <textarea defaultValue={e.notes||''} placeholder="Note…" rows={1}
                    onChange={ev=>debouncedNoteSave(p.id,ev.target.value)}
                    className="note-area" style={S.noteArea} />
                </td>
                <td style={{...S.td,textAlign:'center',padding:'4px 6px'}}>
                  <button onClick={()=>onOpenPanel(p)} title="Edit in panel" className="panel-btn"
                    style={{background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:6,width:28,height:28,color:'#6366f1',fontSize:12,display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}}>✏️</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const OWNERS = ['Unassigned', 'Resh', 'Sheila', 'Vannessa']

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState('master')
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [panelProduct, setPanelProduct] = useState(null)

  useEffect(() => {
    fetchAllEdits().then(data => {
      setEdits(data); setLoading(false); setLastSync(new Date().toLocaleTimeString())
    })
  }, [])

  // Tab-specific stats
  const trackedProducts = products.filter(p => p.creative)
  function crCount(field, val) {
    return trackedProducts.filter(p => {
      const e = edits[p.id] || {}
      const cur = e[`cr_${field}`] || (p.creative?.[field]) || 'Pending'
      return cur === val
    }).length
  }
  function ownerCount(owner) {
    return trackedProducts.filter(p => (edits[p.id]||{}).owner === owner).length
  }
  const openCreatives = trackedProducts.filter(p => {
    const e = edits[p.id] || {}
    const inf = e.cr_inf || p.creative?.inf || 'Pending'
    const copy = e.cr_copy || p.creative?.copy || 'Pending'
    const aplus = e.cr_aplus || p.creative?.aplus || 'Pending'
    return [inf, copy, aplus].some(v => v !== 'Done' && v !== 'N/A')
  }).length

  const tabStats = {
    master: [
      {v:stats.total,l:'Parent Products'},{v:stats.active,l:'Active'},
      {v:stats.inactive,l:'Inactive/Removed'},{v:stats.f26_live,l:'F26 Live'},
      {v:stats.f26_pending,l:'F26 Pending'},{v:stats.creative,l:'Creative Tracked'}
    ],
    f26: [
      {v:stats.f26_live,l:'Live in Catalog'},{v:stats.f26_pending,l:'Pending Creation'},
      {v:crCount('inf','Done'),l:'Inf Done'},{v:crCount('inf','Uploading'),l:'Inf Uploading'},
      {v:crCount('copy','Done'),l:'Copy Done'},{v:crCount('aplus','Done'),l:'A+ Done'}
    ],
    creative: [
      {v:trackedProducts.length,l:'Total Tracked'},{v:openCreatives,l:'Open Creatives'},
      {v:crCount('inf','Done')+crCount('copy','Done')+crCount('aplus','Done'),l:'Components Done'},
      {v:ownerCount('Resh'),l:'Resh'},{v:ownerCount('Sheila'),l:'Sheila'},
      {v:ownerCount('Vannessa'),l:'Vannessa'}
    ]
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      {panelProduct && (
        <SidePanel product={panelProduct} edits={edits} setEdits={setEdits} onClose={()=>setPanelProduct(null)} />
      )}
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#818cf8,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:'0 2px 8px rgba(99,102,241,.4)' }}>⛵</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.3px', lineHeight:1.2 }}>Pendleton Amazon Dashboard</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.45)', marginTop:2, letterSpacing:'.2px' }}>Avenue7 Media · {CATALOG.generated}</div>
          </div>
        </div>
        <div style={{flex:1}} />
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {loading
            ? <span style={{fontSize:11,color:'#fbbf24',background:'rgba(251,191,36,.1)',padding:'4px 10px',borderRadius:20}}>⏳ Loading…</span>
            : <span style={{fontSize:11,color:'#86efac',background:'rgba(134,239,172,.1)',padding:'4px 10px',borderRadius:20,border:'1px solid rgba(134,239,172,.2)'}}>✓ Synced {lastSync}</span>}
        </div>
      </div>
      <div style={S.statsBar}>
        {(tabStats[tab]||tabStats.master).map(({v,l},i)=>{
          const accents=['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6']
          const acc = accents[i % accents.length]
          return (
            <div key={l} className="stat-card" style={{...S.statCard, borderLeftColor:acc}}>
              <div style={{fontSize:24,fontWeight:800,color:'#0f172a',lineHeight:1}}>{v}</div>
              <div style={{fontSize:10,color:'#94a3b8',marginTop:3,fontWeight:500,whiteSpace:'nowrap'}}>{l}</div>
            </div>
          )
        })}
      </div>
      <div style={S.tabBar}>
        {[{id:'master',label:'📋 Master Catalog'},{id:'f26',label:'📦 F26 Launches'},{id:'creative',label:'🎨 Creative Tracker'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="tab-btn"
            style={{...S.tabBtn,...(tab===t.id?S.tabBtnActive:{})}}>{t.label}</button>
        ))}
        <div style={{flex:1}} />
        <span style={{fontSize:10,color:'#94a3b8',alignSelf:'center',paddingRight:16,letterSpacing:'.3px'}}>✦ Edits auto-save</span>
      </div>
      <div style={{flex:1}}>
        {tab==='master' && <MasterTab edits={edits} setEdits={setEdits} onOpenPanel={setPanelProduct} />}
        {tab==='f26' && <F26Tab edits={edits} setEdits={setEdits} onOpenPanel={setPanelProduct} />}
        {tab==='creative' && <CreativeTab edits={edits} setEdits={setEdits} onOpenPanel={setPanelProduct} />}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  header: { background:'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', color:'#fff', padding:'14px 24px', display:'flex', alignItems:'center', gap:16, position:'sticky', top:0, zIndex:100, boxShadow:'0 4px 20px rgba(0,0,0,.35)', borderBottom:'1px solid rgba(255,255,255,.07)' },
  statsBar: { background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'12px 24px', display:'flex', gap:10, flexWrap:'wrap', boxShadow:'0 1px 4px rgba(0,0,0,.04)' },
  statCard: { background:'#fff', borderRadius:10, padding:'10px 20px', textAlign:'center', borderLeft:'3px solid #6366f1', boxShadow:'0 1px 6px rgba(0,0,0,.07)', minWidth:88 },
  tabBar: { background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 24px', display:'flex', gap:2, position:'sticky', top:57, zIndex:90, boxShadow:'0 2px 8px rgba(0,0,0,.04)' },
  tabBtn: { border:'none', borderBottom:'3px solid transparent', background:'transparent', padding:'12px 18px', fontWeight:600, fontSize:13, color:'#64748b', cursor:'pointer', marginBottom:-1 },
  tabBtnActive: { color:'#6366f1', borderBottomColor:'#6366f1' },
  toolbar: { background:'#fff', borderBottom:'1px solid #f1f5f9', padding:'10px 20px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', position:'sticky', top:112, zIndex:80, boxShadow:'0 2px 6px rgba(0,0,0,.04)' },
  searchBox: { border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', fontSize:12, width:230, outline:'none', background:'#f8fafc' },
  sel: { border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:12, background:'#f8fafc' },
  cbLabel: { fontSize:11, color:'#64748b', display:'flex', alignItems:'center', gap:4 },
  btnGray: { border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:600, background:'#f8fafc', color:'#475569', cursor:'pointer' },
  btnBlue: { border:'none', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, background:'linear-gradient(135deg, #6366f1, #4f46e5)', color:'#fff', cursor:'pointer', boxShadow:'0 2px 8px rgba(99,102,241,.3)' },
  table: { borderCollapse:'collapse', width:'100%', minWidth:1000, background:'#fff', borderRadius:10, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,.08)' },
  th: { background:'#0f172a', color:'#94a3b8', padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'.6px' },
  td: { padding:'7px 10px', verticalAlign:'middle', fontSize:12, borderBottom:'1px solid #f1f5f9' },
  pRow: { background:'#fff' },
  catRow: { background:'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding:'6px 12px', fontWeight:800, fontSize:10, color:'#4338ca', textTransform:'uppercase', letterSpacing:'1px', borderTop:'2px solid #c7d2fe', position:'sticky', top:152, zIndex:60 },
  pinnedRow: { background:'linear-gradient(90deg,#fefce8,#fffbeb)', padding:'6px 12px', fontWeight:800, fontSize:10, color:'#b45309', textTransform:'uppercase', letterSpacing:'1px', borderTop:'2px solid #fde68a', position:'sticky', top:152, zIndex:60 },
  expandBtn: { width:20, height:20, borderRadius:4, border:'1px solid #e2e8f0', background:'#f8fafc', fontSize:9, display:'inline-flex', alignItems:'center', justifyContent:'center', color:'#64748b', cursor:'pointer' },
  noteArea: { width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 8px', fontSize:11, resize:'none', minHeight:28, fontFamily:'inherit', outline:'none', background:'#fafafa' },
  inlineSelect: { border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 6px', fontSize:11, width:'100%', outline:'none', background:'#fafafa' },
  crSelect: { border:'1px solid #e2e8f0', borderRadius:5, padding:'3px 5px', fontSize:10, width:'100%', outline:'none', background:'#fafafa' },
  flagBtn: { width:28, height:24, borderRadius:5, border:'1px solid #e2e8f0', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'#fff' },
  sectionTitle: { fontSize:11, fontWeight:800, color:'#475569', marginBottom:14, paddingBottom:10, borderBottom:'2px solid #e2e8f0', textTransform:'uppercase', letterSpacing:'1px' },
}
