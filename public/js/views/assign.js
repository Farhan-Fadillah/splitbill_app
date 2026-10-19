import { h, rp, toast, put } from '../util.js';
import { state, save, activeReceipt, addPerson, removePerson, savedFriends, addSavedFriend, removeSavedFriend, owner } from '../store.js';
import { allocate, lineTotal, validateAssignment, ROUND_STEPS, initials } from '../split.js';
import { stepper, receiptTabs, banner, pageHead, stickyBar } from './common.js';

export const title = 'Atur Pembagian';

/** Jumlah per orang untuk satu item berdasarkan penugasannya. */
function itemShares(item, assignment) {
  const cost = lineTotal(item);
  const ids = state.people.map((p) => p.id);
  let use = ids, weights = ids.map(() => 1);
  if (assignment) {
    const sel = Object.keys(assignment.shares).filter((id) => ids.includes(id));
    if (sel.length) {
      use = sel;
      weights = sel.map((id) => (assignment.mode === 'equal' ? 1 : Number(assignment.shares[id]) || 0));
    }
  }
  const parts = allocate(cost, weights);
  return use.map((id, i) => ({ id, amount: parts[i] }));
}

const personName = (id) => state.people.find((p) => p.id === id)?.name || '?';

export function render(root, { go }) {
  const wrap = h('div');
  root.replaceChildren(wrap);
  let focusAdd = false;

  function draw() {
    const r = activeReceipt();
    if (!r) return go('/scan');
    const unset = r.items.filter((it) => !r.assignments[it.id]).length;

    // ----- peserta -----
    const addInput = h('input', { class: 'input', placeholder: 'Nama teman', maxlength: '40', 'aria-label': 'Nama teman', onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } } });
    function add(nameArg) {
      const name = (nameArg ?? addInput.value).trim();
      if (!name) return;
      if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast(`${name} sudah ada di daftar`);
      if (state.people.length >= 30) return toast('Maksimal 30 orang');
      addPerson(name); addSavedFriend(name); focusAdd = true; draw();
    }
    const ownerInput = h('input', { class: 'input', value: owner().name, maxlength: '40', 'aria-label': 'Nama kamu (penagih)', onInput: (e) => { owner().name = e.target.value.trim() || 'Saya'; state.created = null; save(); } });
    const others = state.people.filter((p) => p.id !== state.ownerId);
    const saved = savedFriends().filter((n) => !state.people.some((p) => p.name.toLowerCase() === n.toLowerCase()));

    const peopleCard = h('div', { class: 'card stack' },
      h('div', { class: 't-sm' }, 'Siapa saja yang ikut?'),
      h('div', { class: 'field' }, h('label', null, 'Nama kamu (penagih)'), ownerInput),
      h('div', { class: 'row wrap' }, others.length
        ? others.map((p) => h('span', { class: 'chip' }, h('span', { class: 'avatar avatar-sm' }, initials(p.name)), p.name,
          h('button', { type: 'button', class: 'x', 'aria-label': `Hapus ${p.name}`, onClick: () => { removePerson(p.id); draw(); } }, '×')))
        : h('span', { class: 'muted' }, 'Belum ada teman. Tambahkan di bawah.')),
      h('div', { class: 'row', style: 'align-items:flex-end' }, h('div', { class: 'field grow' }, h('label', null, 'Tambah teman'), addInput), h('button', { type: 'button', class: 'btn btn-primary', onClick: () => add() }, 'Tambah Teman')),
      saved.length ? h('div', { class: 'stack-sm' }, h('span', { class: 'label' }, 'Teman tersimpan'),
        h('div', { class: 'row wrap' }, saved.map((n) => h('span', { class: 'chip' },
          h('button', { type: 'button', class: 'chip-add', style: 'background:transparent;border:0;cursor:pointer;color:var(--primary);min-height:2rem;padding:0 .25rem', onClick: () => add(n) }, `+ ${n}`),
          h('button', { type: 'button', class: 'x', 'aria-label': `Hapus ${n} dari daftar tersimpan`, onClick: () => { removeSavedFriend(n); draw(); } }, '×'))))) : null);

    // ----- daftar item -----
    const itemsCard = h('div', { class: 'card stack-sm' },
      h('div', { class: 't-sm' }, 'Siapa makan apa?'),
      h('p', { class: 't-body-sm muted' }, 'Ketuk item untuk memilih siapa yang ikut membayar. Item yang belum dipilih dibagi rata ke semua orang.'),
      unset ? banner('warn', `${unset} item belum dipilih, akan dibagi rata ke semua orang.`) : null,
      r.items.length ? h('div', null, r.items.map((it) => {
        const a = r.assignments[it.id];
        const shares = itemShares(it, a);
        const summary = a ? shares.map((s) => `${personName(s.id)} ${rp(s.amount)}`).join(' · ') : 'Semua orang, bagi rata';
        const modeLabel = a ? { equal: `${shares.length} orang, bagi rata`, portion: 'per porsi', percent: 'persentase' }[a.mode] : null;
        return h('button', { type: 'button', class: `assign-item${a ? '' : ' unset'}`, onClick: () => openSheet(r, it, draw), 'aria-label': `Atur pembagian ${it.name}` },
          h('div', { class: 'stack-sm', style: 'gap:.125rem;min-width:0' },
            h('div', { class: 'row-between' }, h('span', { class: 'strong', style: 'overflow-wrap:anywhere' }, it.name || '(tanpa nama)'), h('span', { class: 'num strong' }, rp(lineTotal(it)))),
            h('span', { class: 't-body-sm muted' }, `${it.qty} × ${rp(it.unit_price)}${modeLabel ? ` · ${modeLabel}` : ''}`),
            h('span', { class: 't-body-sm', style: 'overflow-wrap:anywhere' }, summary)),
          h('span', { class: 'avatars', 'aria-hidden': 'true' }, (a ? shares : state.people.map((p) => ({ id: p.id }))).slice(0, 4).map((s) => h('span', { class: 'avatar avatar-sm' }, initials(personName(s.id))))));
      })) : h('div', { class: 'empty' }, 'Struk ini belum punya item. Kembali ke langkah Koreksi untuk menambahkannya.'));

    // ----- pembulatan -----
    const roundCard = h('div', { class: 'card stack-sm' },
      h('div', { class: 't-sm' }, 'Pembulatan transfer'),
      h('p', { class: 't-body-sm muted' }, 'Nominal teman dibulatkan ke terdekat. Selisihnya ditanggung penagih (kamu), jadi total tetap persis sama dengan struk.'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Pembulatan' }, ROUND_STEPS.map((s) =>
        h('button', { type: 'button', 'aria-pressed': String(state.roundStep === s), onClick: () => { state.roundStep = s; state.created = null; save(); draw(); } }, s === 0 ? 'Tidak' : `Rp${new Intl.NumberFormat('id-ID').format(s)}`))));

    wrap.replaceChildren(
      stepper('assign'),
      receiptTabs({ current: state.active, onSelect: (i) => { state.active = i; save(); draw(); } }),
      h('div', { style: 'height:var(--sp-md)' }),
      pageHead('Atur Pembagian', 'Tambahkan teman, lalu tentukan siapa yang ikut membayar tiap item.'),
      h('div', { class: 'stack-lg' }, peopleCard, itemsCard, roundCard),
      stickyBar(h('span', { class: 't-body-sm muted' }, `${state.people.length} orang · ${r.items.length} item`),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => go('/summary') }, 'Lihat Ringkasan')));
    if (focusAdd) { focusAdd = false; addInput.focus(); }
  }
  draw();
}

// ------------------------------------------------------------------ bottom sheet
function openSheet(r, item, onDone) {
  const existing = r.assignments[item.id];
  let mode = existing?.mode || 'equal';
  const sel = new Set(existing ? Object.keys(existing.shares).filter((id) => state.people.some((p) => p.id === id)) : []);
  const vals = { ...(existing?.shares || {}) };
  const cost = lineTotal(item);
  const dlg = h('dialog', { class: 'sheet', 'aria-label': `Atur pembagian ${item.name}` });
  const body = h('div', { class: 'sheet-body stack' });
  const msg = h('span', { class: 't-body-sm' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Simpan');
  const amtEls = new Map();

  const draft = () => ({ mode, shares: Object.fromEntries([...sel].map((id) => [id, mode === 'equal' ? 1 : Number(vals[id]) || 0])) });

  function preview() {
    const d = draft();
    const v = validateAssignment(d);
    const ids = [...sel];
    const parts = ids.length ? allocate(cost, ids.map((id) => (mode === 'equal' ? 1 : Number(vals[id]) || 0))) : [];
    amtEls.forEach((el) => { el.textContent = ''; });
    ids.forEach((id, i) => { const el = amtEls.get(id); if (el) el.textContent = v.ok || mode !== 'percent' ? rp(parts[i]) : ''; });
    msg.textContent = v.ok ? (ids.length ? `Total ${rp(cost)} dibagi ke ${ids.length} orang` : '') : v.message;
    msg.style.color = v.ok ? 'var(--on-var)' : 'var(--error)';
    saveBtn.disabled = !v.ok;
  }

  function equalPercents() {
    const ids = [...sel];
    const base = Math.floor((10000 / ids.length)) / 100;
    ids.forEach((id) => { vals[id] = base; });
    if (ids.length) vals[ids[ids.length - 1]] = Math.round((100 - base * (ids.length - 1)) * 100) / 100;
  }

  function setMode(m) {
    const prev = mode;
    mode = m;
    if (m === 'portion' && prev !== 'portion') [...sel].forEach((id) => { vals[id] = 1; });
    if (m === 'percent') equalPercents();
    paint();
  }

  function paint() {
    amtEls.clear();
    const modes = [['equal', 'Bagi Rata'], ['portion', 'Per Porsi'], ['percent', 'Persentase']];
    put(body,
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Cara membagi' }, modes.map(([m, label]) => h('button', { type: 'button', 'aria-pressed': String(mode === m), onClick: () => setMode(m) }, label))),
      h('p', { class: 't-body-sm muted' }, { equal: 'Semua orang yang dipilih membayar sama besar.', portion: 'Isi jumlah porsi tiap orang, misalnya 2 untuk yang makan dua kali lipat.', percent: 'Isi persentase tiap orang. Totalnya harus 100%.' }[mode]),
      h('div', { class: 'stack-sm' }, state.people.map((p) => {
        const checked = sel.has(p.id);
        const amt = h('span', { class: 't-body-sm muted num' });
        amtEls.set(p.id, amt);
        const cb = h('input', { type: 'checkbox', checked, 'aria-label': p.name, onChange: (e) => {
          if (e.target.checked) { sel.add(p.id); if (mode === 'portion' && !(vals[p.id] > 0)) vals[p.id] = 1; if (mode === 'percent') equalPercents(); }
          else sel.delete(p.id);
          if (mode === 'percent') equalPercents();
          paint();
        } });
        return h('div', { class: 'person-line' },
          h('label', { class: 'check' }, cb, h('span', { class: 'avatar avatar-sm' }, initials(p.name)), h('span', { class: 'strong' }, p.name)),
          checked && mode !== 'equal'
            ? h('input', { class: 'input num-in', type: 'number', min: '0', step: mode === 'percent' ? '0.01' : '0.5', inputmode: 'decimal', value: vals[p.id] ?? '', 'aria-label': `${mode === 'percent' ? 'Persentase' : 'Porsi'} ${p.name}`, onInput: (e) => { vals[p.id] = e.target.value === '' ? 0 : Number(e.target.value); preview(); } })
            : h('span'),
          h('span', { class: 'amt' }, amt));
      })),
      mode === 'percent' && sel.size ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', style: 'align-self:flex-start', onClick: () => { equalPercents(); paint(); } }, 'Bagi sama rata') : null,
      !sel.size ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', style: 'align-self:flex-start', onClick: () => { state.people.forEach((p) => sel.add(p.id)); if (mode === 'percent') equalPercents(); paint(); } }, 'Pilih semua orang') : null);
    preview();
  }

  saveBtn.addEventListener('click', () => {
    r.assignments[item.id] = draft();
    state.created = null; save();
    dlg.close(); onDone();
  });
  dlg.append(
    h('div', { class: 'sheet-head' }, h('div', { class: 't-sm', style: 'overflow-wrap:anywhere' }, item.name || '(tanpa nama)'), h('div', { class: 'muted num' }, `${item.qty} × ${rp(item.unit_price)} = ${rp(cost)}`)),
    body,
    h('div', { class: 'sheet-foot' }, msg, h('span', { class: 'grow' }),
      existing ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onClick: () => { delete r.assignments[item.id]; state.created = null; save(); dlg.close(); onDone(); } }, 'Reset') : null,
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => dlg.close() }, 'Batal'), saveBtn));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  paint();
  dlg.showModal();
}
