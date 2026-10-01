(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  const toast = (msg, type = 'success') => {
    let box = $('#toast-container');
    if (!box) { box = document.createElement('div'); box.id = 'toast-container'; box.className = 'toast-container'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><div>${msg}</div>`;
    box.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 4200);
  };
  document.body.classList.add('page-ready');

  // ---------- Autenticação (simulada no navegador; no projeto final fica no Flask + SQLite) ----------
  const hash = async s => {
    if (!(window.crypto && crypto.subtle)) return btoa(unescape(encodeURIComponent(s)));
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const users = () => store.get('norte_users', {});
  const norm = v => (v || '').trim().toLowerCase();

  $$('form[data-auth]').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const kind = form.dataset.auth, f = n => form.elements[n]?.value || '';
    const email = norm(f('email')), pw = f('password'), all = users();
    if (kind === 'login') {
      if (all[email] && all[email].hash === await hash(pw)) { localStorage.setItem('norte_session', email); location.href = 'dashboard.html'; }
      else toast('E-mail ou senha incorretos.', 'error');
    } else if (kind === 'cadastro') {
      if (pw.length < 6) return toast('A senha deve ter pelo menos 6 caracteres.', 'error');
      if (pw !== f('password2')) return toast('As senhas precisam ser iguais.', 'error');
      if (all[email]) return toast('Este e-mail já está cadastrado.', 'error');
      all[email] = { hash: await hash(pw) }; store.set('norte_users', all);
      localStorage.setItem('norte_session', email); location.href = 'dashboard.html';
    } else if (kind === 'reset-request') {
      if (all[email]) {
        const token = String(Math.floor(100000 + Math.random() * 900000));
        store.set('norte_reset', { email, token, exp: Date.now() + 15 * 60000 });
        toast(`Simulação de e-mail enviado. Seu token de redefinição é <b>${token}</b> (válido por 15 min).`, 'info');
      } else toast('Se o e-mail estiver cadastrado, você receberá o token de redefinição.', 'info');
      $('#step-request').hidden = true; $('#step-reset').hidden = false;
      $('#reset-email').value = email;
    } else if (kind === 'reset-confirm') {
      const r = store.get('norte_reset', null);
      if (!r || r.email !== norm(f('email')) || r.token !== f('token').trim() || Date.now() > r.exp) return toast('Token inválido ou expirado.', 'error');
      if (pw.length < 6) return toast('A senha deve ter pelo menos 6 caracteres.', 'error');
      if (pw !== f('password2')) return toast('As senhas precisam ser iguais.', 'error');
      all[r.email].hash = await hash(pw); store.set('norte_users', all); localStorage.removeItem('norte_reset');
      toast('Senha redefinida com sucesso. Redirecionando para o login...'); setTimeout(() => location.href = 'login.html', 1500);
    }
  }));

  if (document.body.dataset.page !== 'app') return;

  // ---------- Aplicação (SPA) ----------
  const user = localStorage.getItem('norte_session');
  if (!user || !users()[user]) { location.replace('login.html'); return; }
  $('[data-logout]').addEventListener('click', () => localStorage.removeItem('norte_session'));

  const CATS = {
    despesa: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Educação', 'Saúde', 'Assinaturas', 'Outros'],
    receita: ['Salário', 'Serviços', 'Outros']
  };
  // Categorização automática: palavras-chave da descrição -> categoria sugerida
  const KEYWORDS = {
    despesa: {
      Alimentação: ['mercado', 'supermercado', 'restaurante', 'lanche', 'padaria', 'pizza', 'ifood', 'açougue', 'almoço', 'jantar', 'café'],
      Transporte: ['combustível', 'gasolina', 'uber', 'ônibus', 'onibus', 'passagem', 'estacionamento', 'pedágio', 'táxi', 'oficina'],
      Moradia: ['aluguel', 'condomínio', 'condominio', 'luz', 'água', 'agua', 'energia', 'internet', 'gás', 'iptu'],
      Lazer: ['cinema', 'show', 'bar', 'viagem', 'jogo', 'festa', 'parque', 'balada'],
      Educação: ['curso', 'faculdade', 'livro', 'escola', 'mensalidade escolar', 'apostila'],
      Saúde: ['farmácia', 'farmacia', 'plano de saúde', 'consulta', 'médico', 'remédio', 'dentista', 'exame'],
      Assinaturas: ['netflix', 'spotify', 'streaming', 'assinatura', 'prime', 'youtube']
    },
    receita: {
      Salário: ['salário', 'salario', 'pagamento', 'holerite', '13º'],
      Serviços: ['freelance', 'freela', 'projeto', 'serviço', 'consultoria']
    }
  };
  const suggest = (type, desc) => {
    const d = desc.toLowerCase();
    for (const [cat, words] of Object.entries(KEYWORDS[type])) if (words.some(w => d.includes(w))) return cat;
    return null;
  };

  const kTx = 'norte_tx:' + user, kBud = 'norte_bud:' + user;
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const iso = day => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`;
  if (!localStorage.getItem(kTx)) { // dados demonstrativos apenas no primeiro acesso do usuário
    store.set(kTx, [
      ['receita', 'Salário', 4500, 5, 'Salário'], ['receita', 'Freelance projeto web', 1250, 12, 'Serviços'],
      ['despesa', 'Aluguel', 1300, 1, 'Moradia'], ['despesa', 'Supermercado', 784.95, 3, 'Alimentação'],
      ['despesa', 'Curso online', 780, 8, 'Educação'], ['despesa', 'Plano de saúde', 487.45, 10, 'Saúde'],
      ['despesa', 'Combustível', 280, 16, 'Transporte'], ['despesa', 'Streaming', 76.8, 20, 'Assinaturas']
    ].map(([type, desc, amount, d, cat], i) => ({ id: 'd' + i, type, desc, amount, date: iso(d), cat })));
    store.set(kBud, { Moradia: 1800, Alimentação: 900, Educação: 800, Transporte: 500 });
  }
  const tx = () => store.get(kTx, []), buds = () => store.get(kBud, {});
  const money = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fdate = d => d.split('-').reverse().join('/');
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const sum = (list, type) => list.filter(t => t.type === type).reduce((a, t) => a + t.amount, 0);
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  // Uso do teto por categoria no mês atual
  const usage = () => Object.entries(buds()).map(([cat, limit]) => {
    const used = tx().filter(t => t.type === 'despesa' && t.cat === cat && t.date.startsWith(ym)).reduce((a, t) => a + t.amount, 0);
    const pct = limit ? Math.round(used / limit * 100) : 0;
    return { cat, limit, used, pct, state: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok' };
  });
  const budRow = (u, actions) => `<article class="card budget-row"><div class="budget-info"><div><b>${u.cat}</b><small>${money(u.used)} de ${money(u.limit)}</small></div></div>
    <strong>${u.pct}%</strong><div class="budget-track ${u.state}"><span style="width:${Math.min(u.pct, 100)}%"></span></div>${actions || ''}</article>`;
  const alertTag = u => u.state === 'danger' ? '<span class="tag tag-red">Orçamento excedido</span>' : u.state === 'warning' ? '<span class="tag tag-yellow">Perto do limite</span>' : '';

  // Navegação entre telas
  const titles = { dashboard: 'Dashboard', lancamento: 'Novo lançamento', extrato: 'Extrato', metas: 'Metas e teto de gastos' };
  function showView(v, hash = true) {
    if (!titles[v]) v = 'dashboard';
    $$('.spa-view').forEach(s => s.hidden = s.dataset.view !== v);
    $$('.nav a[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === v));
    $('.top-title strong').textContent = titles[v];
    if (hash && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    if (v === 'lancamento' && !editing) resetForm();
    render(); window.scrollTo({ top: 0 });
  }
  $$('a[data-view], button[data-view]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); if (a.dataset.view === 'lancamento') editing = null; showView(a.dataset.view); }));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));

  // Formulário de lançamento (criar / editar)
  let editing = null, type = 'despesa', manualCat = false;
  const form = $('#tx-form');
  function fillCats(selected) {
    form.category.innerHTML = CATS[type].map(c => `<option${c === selected ? ' selected' : ''}>${c}</option>`).join('');
  }
  function setType(t) { type = t; $$('#type-toggle button').forEach(b => b.classList.toggle('active', b.dataset.type === t)); fillCats(); $('#cat-hint').textContent = ''; }
  function resetForm() { form.reset(); editing = null; manualCat = false; setType('despesa'); form.date.value = iso(now.getDate()); $('#form-title').textContent = 'Novo lançamento'; $('#form-submit').textContent = 'Salvar lançamento'; }
  $$('#type-toggle button').forEach(b => b.addEventListener('click', () => { manualCat = false; setType(b.dataset.type); runSuggest(); }));
  function runSuggest() {
    if (manualCat) return;
    const c = suggest(type, form.description.value);
    if (c) { form.category.value = c; $('#cat-hint').textContent = `Categoria sugerida automaticamente: ${c}`; } else $('#cat-hint').textContent = '';
  }
  form.description.addEventListener('input', runSuggest);
  form.category.addEventListener('change', () => { manualCat = true; $('#cat-hint').textContent = ''; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const amount = Number(form.amount.value);
    if (!(amount > 0)) return toast('Informe um valor maior que zero.', 'error');
    const rec = { id: editing || 't' + Date.now(), type, desc: form.description.value.trim(), amount, date: form.date.value, cat: form.category.value };
    const list = tx(), i = list.findIndex(t => t.id === rec.id);
    i >= 0 ? list[i] = rec : list.push(rec); store.set(kTx, list);
    const wasEdit = !!editing; editing = null;
    toast(wasEdit ? 'Lançamento atualizado.' : `${type === 'receita' ? 'Receita' : 'Despesa'} registrada.`);
    const u = usage().find(x => x.cat === rec.cat && rec.type === 'despesa' && rec.date.startsWith(ym));
    if (u && u.state !== 'ok') setTimeout(() => toast(u.state === 'danger' ? `Atenção: o teto de ${u.cat} foi excedido (${u.pct}%).` : `Atenção: ${u.cat} está em ${u.pct}% do teto.`, 'error'), 400);
    showView('extrato');
  });

  // Extrato com filtro por mês e ano
  const fm = $('#f-month'), fy = $('#f-year');
  fm.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  fm.value = now.getMonth() + 1;
  function fillYears() {
    const ys = new Set([now.getFullYear(), ...tx().map(t => +t.date.slice(0, 4))]), cur = fy.value;
    fy.innerHTML = [...ys].sort((a, b) => b - a).map(y => `<option>${y}</option>`).join(''); fy.value = cur && ys.has(+cur) ? cur : now.getFullYear();
  }
  [fm, fy].forEach(s => s.addEventListener('change', renderExtrato));
  function renderExtrato() {
    const p = `${fy.value}-${pad(fm.value)}`;
    const list = tx().filter(t => t.date.startsWith(p)).sort((a, b) => b.date.localeCompare(a.date));
    const inc = sum(list, 'receita'), out = sum(list, 'despesa');
    $('#x-in').textContent = money(inc); $('#x-out').textContent = money(out); $('#x-bal').textContent = money(inc - out);
    $('#x-count').textContent = `${list.length} registro(s) em ${MESES[fm.value - 1]} de ${fy.value}`;
    $('#x-body').innerHTML = list.length ? list.map(t => `<tr><td>${fdate(t.date)}</td><td><b>${esc(t.desc)}</b></td><td><span class="tag">${t.cat}</span></td>
      <td class="${t.type === 'receita' ? 'positive' : 'negative'}">${t.type === 'receita' ? '+' : '−'} ${money(t.amount)}</td>
      <td><button class="icon-btn" data-edit="${t.id}" title="Editar">✎</button><button class="icon-btn" data-del="${t.id}" title="Excluir">✕</button></td></tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:26px">Nenhuma movimentação neste período.</td></tr>';
  }
  $('#x-body').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      const t = tx().find(x => x.id === ed.dataset.edit); editing = t.id; manualCat = true;
      showView('lancamento'); setType(t.type); form.description.value = t.desc; form.amount.value = t.amount; form.date.value = t.date; fillCats(t.cat);
      $('#form-title').textContent = 'Editar lançamento'; $('#form-submit').textContent = 'Salvar alterações';
    } else if (del && confirm('Excluir este lançamento?')) { store.set(kTx, tx().filter(x => x.id !== del.dataset.del)); toast('Lançamento excluído.', 'info'); render(); }
  });

  // Dashboard
  function renderDash() {
    const all = tx(), month = all.filter(t => t.date.startsWith(ym));
    $('#d-balance').textContent = (sum(all, 'receita') - sum(all, 'despesa')).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    $('#d-in').textContent = money(sum(month, 'receita')); $('#d-out').textContent = money(sum(month, 'despesa'));
    const al = usage().filter(u => u.state !== 'ok');
    $('#d-alerts').innerHTML = al.length ? al.map(u => budRow(u, alertTag(u))).join('') : '<p class="muted">Nenhum alerta: todos os gastos estão dentro dos tetos definidos.</p>';
    const spent = {}; month.filter(t => t.type === 'despesa').forEach(t => spent[t.cat] = (spent[t.cat] || 0) + t.amount);
    $('#d-cats').innerHTML = Object.entries(spent).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="cat-row"><span>${c}</span><b>${money(v)}</b></div>`).join('') || '<p class="muted">Sem despesas neste mês.</p>';
  }

  // Metas e teto de gastos por categoria
  const bm = $('#b-modal');
  const openB = cat => { $('#b-cat').innerHTML = CATS.despesa.map(c => `<option${c === cat ? ' selected' : ''}>${c}</option>`).join(''); $('#b-limit').value = cat ? buds()[cat] : ''; bm.classList.add('open'); document.body.classList.add('modal-open'); };
  const closeB = () => { bm.classList.remove('open'); document.body.classList.remove('modal-open'); };
  $('[data-new-budget]').addEventListener('click', () => openB());
  $('.modal-close', bm).addEventListener('click', closeB); bm.addEventListener('click', e => { if (e.target === bm) closeB(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeB(); });
  $('#b-form').addEventListener('submit', e => {
    e.preventDefault(); const limit = Number($('#b-limit').value);
    if (!(limit > 0)) return toast('Informe um limite maior que zero.', 'error');
    const b = buds(); b[$('#b-cat').value] = limit; store.set(kBud, b); closeB(); toast('Teto de gastos salvo.'); render();
  });
  function renderBudgets() {
    const u = usage(), lim = u.reduce((a, x) => a + x.limit, 0), used = u.reduce((a, x) => a + x.used, 0);
    $('#b-total').textContent = money(lim); $('#b-used').textContent = `${money(used)} usados`;
    $('#b-avail').textContent = money(Math.max(lim - used, 0));
    $('#b-list').innerHTML = u.length ? u.map(x => budRow(x, `<span>${alertTag(x)}<button class="icon-btn" data-bedit="${x.cat}" title="Editar">✎</button><button class="icon-btn" data-bdel="${x.cat}" title="Remover">✕</button></span>`)).join('')
      : '<p class="muted">Nenhum teto definido. Clique em “Definir teto” para começar.</p>';
  }
  $('#b-list').addEventListener('click', e => {
    const ed = e.target.closest('[data-bedit]'), del = e.target.closest('[data-bdel]');
    if (ed) openB(ed.dataset.bedit);
    else if (del) { const b = buds(); delete b[del.dataset.bdel]; store.set(kBud, b); toast('Teto removido.', 'info'); render(); }
  });

  function render() { fillYears(); renderDash(); renderExtrato(); renderBudgets(); }
  showView(titles[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard', false);
})();
