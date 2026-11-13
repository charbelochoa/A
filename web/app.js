const root = document.querySelector('#root');
const modal = document.querySelector('#modal');
const config = window.ALURANEE_CONFIG || {};
const siteBase = (config.basePath || '').replace(/\/$/, '');
const apiOrigin = (config.apiOrigin || '').replace(/\/$/, '');
const routePath = (location.pathname.slice(siteBase.length).replace(/\/+$/, '') || '/');
const site = path => siteBase && (path === siteBase || path.startsWith(siteBase + '/')) ? path : siteBase + path;
const mobile = routePath.startsWith('/app');
const base = site(mobile ? '/app' : '/banca');
const sessionKey = 'aluranee-session:' + siteBase;
const state = {user: null, overview: null, beneficiaries: null, csrf: '', transfer: null, key: null, page: 1};
const money = value => new Intl.NumberFormat('es-MX', {style: 'currency', currency: 'MXN'}).format(value / 100);
const date = value => new Intl.DateTimeFormat('es-MX', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value * 1000));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const paths = {arrow: 'M4 12h16m-6-6 6 6-6 6', home: 'm3 10 9-7 9 7v11h-7v-7h-4v7H3Z', accounts: 'M3 7h18v14H3Zm0 4h18M6 3h12', transfer: 'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4', card: 'M3 5h18v14H3Zm0 5h18m-14 5h4', support: 'M4 13v-2a8 8 0 0 1 16 0v6h-4v-7h4M4 10h4v7H4m16 0c0 4-4 4-8 4', user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 6 0 0 1 16 0v3', logout: 'M10 3H3v18h7m4-15 6 6-6 6m-7-6h13', check: 'm5 12 4 4L20 5', close: 'm5 5 14 14M5 19 19 5', plus: 'M12 4v16M4 12h16', lock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0v4', search: 'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', menu: 'M3 6h18M3 12h18M3 18h18', download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', chevron: 'm9 5 7 7-7 7', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.arrow}"/></svg>`;
const brand = (link = '/') => `<a class="brand" href="${site(link)}" aria-label="Aluranee Bank, inicio"><img src="/assets/seal.webp" alt="" width="62" height="62"><span>Aluranee<span class="brand-bank">Bank</span></span></a>`;

class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

async function api(path, options = {}) {
  const {download, ...requestOptions} = options;
  const headers = {'Content-Type': 'application/json', ...options.headers};
  if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const token = sessionStorage.getItem(sessionKey);
  if (token) headers['X-Session-Token'] = token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${apiOrigin}/api${path}`, {...requestOptions, headers, signal: controller.signal, credentials: apiOrigin ? 'omit' : 'same-origin'});
  } catch (error) {
    throw new ApiError(error.name === 'AbortError' ? 'La conexión tardó más de lo esperado. Intenta de nuevo.' : 'No pudimos conectar con tu banca. Revisa tu conexión e intenta de nuevo.');
  } finally { clearTimeout(timeout); }
  if (download && response.ok) {
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = download; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(sessionKey);
    const message = typeof data.detail === 'string' ? data.detail : 'Revisa los datos e intenta de nuevo.';
    if (response.status === 401 && state.user) { state.user = null; state.csrf = ''; location.href = site(mobile ? '/app' : '/acceso'); }
    throw new ApiError(message, response.status);
  }
  if (data.session_token) sessionStorage.setItem(sessionKey, data.session_token);
  if (path === '/auth/logout') sessionStorage.removeItem(sessionKey);
  return data;
}

function notify(message) {
  const el = document.querySelector('#notice');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}

function dialog(content) {
  modal.innerHTML = `<button class="dialog-close icon-button" data-close aria-label="Cerrar">${icon('close')}</button>${content}`;
  modal.setAttribute('aria-label', modal.querySelector('h2')?.textContent || 'Aluranee Bank');
  modal.showModal();
  modal.querySelector('[data-close]').onclick = () => modal.close();
}

modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); } });

function publicHeader() {
  return `<div class="institution-bar"><span>Aluranee · Banca y patrimonio</span><a href="/movil">Aluranee Móvil ${icon('arrow')}</a></div><header class="public-header">${brand()}<nav aria-label="Navegación principal"><a href="/personas">Personas</a><a href="/patrimonio">Patrimonio</a><a href="/nosotros">Nosotros</a><a class="button button-small" href="/acceso">Banca en línea ${icon('arrow')}</a></nav><button class="icon-button public-menu" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button></header>`;
}

function bindPublic() {
  document.querySelector('.public-menu')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.querySelector('.public-header').classList.toggle('menu-open', open);
  });
}

function footer() {
  return `<footer class="public-footer"><div>${brand()}<p>El valor de la confianza.</p></div><div><a href="/personas">Banca personal</a><a href="/patrimonio">Banca patrimonial</a><a href="/movil">Aluranee Móvil</a><a href="/seguridad">Seguridad</a></div><div><a href="/acceso">Banca en línea</a><a href="/nosotros">Nuestra institución</a><a href="/ayuda">Centro de ayuda</a><a href="/privacidad">Aviso de privacidad</a><a href="/terminos">Condiciones de uso</a></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Aluranee Bank</span><span>Entorno académico · Operaciones simuladas</span></div></footer>`;
}

function bindPrivacy() {
  document.querySelector('#privacy')?.addEventListener('click', () => dialog('<h2>Aviso de privacidad</h2><p>Aluranee es una simulación académica para una competencia CTF. Utiliza únicamente identidades y contraseñas ficticias. Los accesos y operaciones quedan registrados para evaluar el reto. No introduzcas datos personales ni bancarios reales.</p>'));
}

function landing() {
  document.body.className = 'public';
  root.innerHTML = `${publicHeader()}<main id="main"><section class="hero"><div class="hero-copy"><div class="hero-index">ALURANEE BANK <span>EST. 1998</span></div><h1>El valor de<br>pensar a futuro.</h1><p>Una visión de largo plazo.<br>Un banco a tu altura.</p><a class="button button-gold" href="/registro">Comienza tu historia ${icon('arrow')}</a><div class="hero-bottom"><span>BANCA PERSONAL Y PATRIMONIAL</span><a href="#personas" aria-label="Descubrir banca personal">↓</a></div></div><div class="hero-photo"><img src="/assets/headquarters.webp" alt="Sede de Aluranee Bank, arquitectura de piedra y cristal" fetchpriority="high"><div class="photo-caption"><span>NUESTRA CASA. TU BANCO.</span><span>01 / 03</span></div></div></section><section class="products section-grid" id="personas"><div class="section-heading"><span class="section-number">01 — PERSONAS</span><h2>Cada decisión.<br>Más posibilidades.</h2><p>Tu vida financiera, con la atención<br>que merece.</p></div><div class="product-list"><a href="/personas"><div><span class="product-number">01</span><h3>Cuenta Patrimonial</h3><p>Libertad para tu día a día.</p></div>${icon('arrow')}</a><a href="/personas"><div><span class="product-number">02</span><h3>Reserva Aluranee</h3><p>Un lugar para lo que viene.</p></div>${icon('arrow')}</a><a href="/movil"><div><span class="product-number">03</span><h3>Tu banco, contigo</h3><p>Control de tu dinero, donde estés.</p></div>${icon('arrow')}</a></div></section><section class="wealth" id="patrimonio"><img src="/assets/advisory.webp" alt="Asesoría patrimonial en una oficina de Aluranee" loading="lazy"><div><span class="section-number">02 — PATRIMONIO</span><h2>Hay cosas que<br>merecen una<br>visión distinta.</h2><p>El tiempo construye patrimonio.<br>La confianza lo hace trascender.</p><a href="/patrimonio" class="text-arrow">Conoce nuestra banca ${icon('arrow')}</a></div></section><section class="institution section-grid" id="nosotros"><div><span class="section-number">03 — NUESTRA INSTITUCIÓN</span><h2>La confianza<br>se construye.</h2></div><div><p class="large-copy">Escuchamos antes de proponer.<br>Pensamos antes de decidir.<br>Acompañamos en cada etapa.</p><div class="institution-signature"><img src="/assets/crest.webp" alt="Sello heráldico Aluranee"><span>Aluranee Bank<br><small>Banca · Finanzas · Confianza</small></span></div></div></section><section class="mobile-promo"><span>ALURANEE MÓVIL</span><h2>Tu mundo no se detiene.<br>Tu banco tampoco.</h2><a class="button button-light" href="/movil">Descubre la aplicación ${icon('arrow')}</a></section></main>${footer()}`;
  bindPublic(); bindPrivacy();
}

function auth(register = false) {
  document.body.className = mobile ? 'mobile auth-mobile' : 'public';
  document.title = (register ? 'Abrir cuenta' : 'Acceso a banca') + ' · Aluranee Bank';
  root.innerHTML = `${mobile ? '' : publicHeader()}<main id="main" class="auth-layout"><div class="auth-image"><img src="/assets/portrait.webp" alt="Atención personal Aluranee Bank"><div><h2>La tranquilidad<br>de estar en casa.</h2><span>ALURANEE BANK</span></div></div><div class="auth-panel">${mobile ? brand('/app') : '<a class="back-link" href="/">← Volver a Aluranee</a>'}<span class="section-number">${mobile ? 'ALURANEE MÓVIL' : 'BANCA EN LÍNEA'}</span><h1>${register ? 'Tu nueva etapa.' : 'Bienvenido a casa.'}</h1><form id="auth-form">${register ? '<label>Nombre ficticio<input name="name" autocomplete="nickname" minlength="3" maxlength="70" required></label>' : ''}<label>Identificador<input name="email" type="email" autocomplete="username" placeholder="equipo@aluranee.invalid" maxlength="120" required></label><label>Contraseña<div class="password-input"><input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="15"' : ''} maxlength="128" required><button type="button" class="icon-button" id="show-password" aria-label="Mostrar contraseña">${icon('eye')}</button></div></label>${register ? '<p class="field-note">Mínimo 15 caracteres. Usa datos ficticios.</p>' : ''}<p class="form-error" id="form-error" role="alert"></p><button class="button full" type="submit">${register ? 'Abrir cuenta' : 'Ingresar'} ${icon('arrow')}</button></form><p class="auth-switch">${register ? '¿Ya eres cliente?' : '¿Tu primera vez en Aluranee?'} <a href="${site(mobile ? (register ? '/app' : '/app/registro') : (register ? '/acceso' : '/registro'))}">${register ? 'Inicia sesión' : 'Abre tu cuenta'}</a></p><div class="auth-security">${icon('lock')}<span>Conexión privada. Banca de confianza.</span></div><span class="simulation-note">Entorno académico · Usa datos ficticios</span></div></main>`;
  bindPublic();
  document.querySelector('#show-password').onclick = event => {
    const input = document.querySelector('[name=password]');
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  };
  document.querySelector('#auth-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]');
    button.disabled = true; document.querySelector('#form-error').textContent = '';
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await api(`/auth/${register ? 'register' : 'login'}`, {method: 'POST', body: JSON.stringify(data)});
      state.csrf = result.csrf; location.href = base;
    } catch (error) { document.querySelector('#form-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}

const navigation = [['', 'home', 'Inicio'], ['/cuentas', 'accounts', 'Mis cuentas'], ['/transferir', 'transfer', 'Transferencias'], ['/movimientos', 'accounts', 'Movimientos'], ['/tarjetas', 'card', 'Tarjetas'], ['/beneficiarios', 'user', 'Beneficiarios'], ['/atencion', 'support', 'Atención al cliente']];

function shell(title, active, content) {
  document.body.className = mobile ? 'mobile banking' : 'banking';
  document.title = title.replace(/[.]$/, '') + ' · Aluranee Bank';
  const initials = state.user.name.split(' ').slice(0, 2).map(s => s[0]).join('');
  root.innerHTML = `<aside class="sidebar">${brand(base)}<div class="sidebar-caption">BANCA EN LÍNEA</div><nav aria-label="Banca personal">${navigation.map(([path, symbol, label]) => `<a class="${active === path ? 'active' : ''}" href="${base}${path}" ${active === path ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${icon('chevron', 'nav-chevron')}</a>`).join('')}</nav><div class="sidebar-bottom"><a href="/movil">${icon('card')}Aluranee Móvil</a><span>Entorno académico</span></div></aside><div class="bank-main"><header class="bank-header"><button class="bank-menu icon-button" id="bank-menu" aria-label="Abrir navegación de banca" aria-haspopup="dialog">${icon('menu')}</button><a class="mobile-brand" href="${base}">Aluranee<span>Bank</span></a><span class="bank-header-label">BANCA PERSONAL</span><div class="user-tools"><a href="${base}/perfil" class="profile-link" aria-label="Mi perfil"><span>${esc(state.user.name)}</span><span class="avatar">${esc(initials)}</span></a><button class="icon-button" id="logout" aria-label="Cerrar sesión">${icon('logout')}</button></div></header><main id="main" class="bank-content"><div class="page-title"><div><span class="section-number">ALURANEE BANK</span><h1>${title}</h1></div><span class="today">${date(Date.now() / 1000)}</span></div>${content}</main><footer class="bank-footer"><span>Aluranee Bank</span><span>Operaciones simuladas · MXN</span></footer></div>${mobile ? `<nav class="bottom-nav bank-island" aria-label="Navegación móvil">${[['', 'home', 'Inicio'], ['/cuentas', 'accounts', 'Cuentas'], ['/transferir', 'transfer', 'Transferir'], ['/tarjetas', 'card', 'Tarjetas'], ['/mas', 'menu', 'Más']].map(([p, i, l]) => `<a href="/app${p}" class="${active === p || (p === '/mas' && ['/movimientos', '/beneficiarios', '/atencion', '/perfil'].includes(active)) ? 'active' : ''}" ${active === p ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span></a>`).join('')}</nav>` : ''}`;
  document.querySelector('#logout').onclick = async () => {
    try { await api('/auth/logout', {method: 'POST'}); location.href = site(mobile ? '/app' : '/'); } catch (error) { notify(error.message); }
  };
  document.querySelector('#bank-menu').onclick = () => dialog(`<h2>Tu banca.</h2><nav class="bank-dialog-nav" aria-label="Navegación de cuentas">${navigation.map(([path, symbol, label]) => `<a href="${base}${path}" ${active === path ? 'aria-current="page"' : ''}>${icon(symbol)}${label}${icon('chevron')}</a>`).join('')}<a href="${base}/perfil">${icon('user')}Mi perfil${icon('chevron')}</a><a href="${site('/ayuda')}">${icon('support')}Centro de ayuda${icon('chevron')}</a></nav>`);
}

function movementTable(items) {
  if (!items.length) return '<div class="empty-state">No hay movimientos para esta selección.</div>';
  return `<div class="movement-table"><div class="table-heading"><span>Operación</span><span>Fecha</span><span>Importe</span></div>${items.map(item => `<div class="movement-row"><span class="movement-symbol">${icon(item.amount > 0 ? 'plus' : 'arrow')}</span><div class="movement-name"><strong>${esc(item.description)}</strong><span>${esc(item.reference)}</span></div><time>${date(item.created_at)}</time><strong class="amount ${item.amount > 0 ? 'positive' : ''}">${item.amount > 0 ? '+' : '−'}${money(Math.abs(item.amount))}</strong></div>`).join('')}</div>`;
}

function bankCard(card) {
  return `<div class="bank-card ${card.frozen ? 'frozen' : ''}"><div>Aluranee<span>BANK</span></div><div class="card-chip" aria-hidden="true"></div><span class="card-digits">•••• &nbsp; •••• &nbsp; •••• &nbsp; ${esc(card.last_four)}</span><div class="card-bottom"><span>${esc(state.user.name.toUpperCase())}</span><span>PATRIMONIAL</span></div>${card.frozen ? '<span class="frozen-label">TARJETA PAUSADA</span>' : ''}</div>`;
}

function dashboard() {
  const {accounts, transactions, cards} = state.overview;
  const hour = new Date().getHours();
  shell(`${hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${esc(state.user.name.split(' ')[0])}.`, '', `<section class="balance-hero"><div><span class="section-number">PATRIMONIO DISPONIBLE</span><h2>${money(accounts.reduce((sum, a) => sum + a.balance, 0))}<small>MXN</small></h2><span class="balance-caption">Todo en su lugar.</span></div><a class="button" href="${base}/transferir">Transferir ${icon('arrow')}</a></section><section class="account-grid">${accounts.map((account, i) => `<a class="account-tile" href="${base}/cuentas"><div><span class="account-mark">A${i + 1}</span>${icon('arrow')}</div><h3>${esc(account.name)}</h3><span class="account-number">•••• ${account.clabe.slice(-4)}</span><strong>${money(account.balance)}</strong><span class="account-tile-caption">Saldo disponible</span></a>`).join('')}</section><div class="dashboard-lower"><section class="panel movements-panel"><div class="panel-heading"><h2>Últimos movimientos</h2><a class="text-arrow" href="${base}/movimientos">Ver todos ${icon('arrow')}</a></div>${movementTable(transactions.slice(0, 5))}</section><aside class="dashboard-aside">${cards[0] ? bankCard(cards[0]) : ''}<a class="service-link" href="${base}/tarjetas">Administra tu tarjeta ${icon('arrow')}</a><a class="support-promo" href="${base}/atencion">${icon('support')}<h3>Cerca de ti.</h3><span>Tu mesa de atención ${icon('arrow')}</span></a></aside></div>`);
}

function accountsPage() {
  shell('Mis cuentas.', '/cuentas', `<div class="accounts-detail">${state.overview.accounts.map(account => `<article class="panel account-detail"><div class="panel-heading"><h2>${esc(account.name)}</h2><span class="status">Activa</span></div><span class="section-number">SALDO DISPONIBLE</span><strong class="detail-balance">${money(account.balance)}</strong><div class="account-facts"><div><span>CLABE de simulación</span><strong>${account.clabe}</strong></div><div><span>Moneda</span><strong>Pesos mexicanos</strong></div></div><div class="inline-actions"><a class="button" href="${base}/transferir">Transferir ${icon('arrow')}</a><a class="text-arrow" href="${base}/movimientos?account=${account.id}">Ver movimientos ${icon('arrow')}</a></div></article>`).join('')}</div>`);
}

async function transactionsPage() {
  const query = new URLSearchParams(location.search);
  const account = query.get('account') || '';
  shell('Tus movimientos.', '/movimientos', `<section class="panel"><form id="movement-filters" class="filters"><label>Cuenta<select name="account"><option value="">Todas mis cuentas</option>${state.overview.accounts.map(a => `<option value="${a.id}" ${account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><label>Buscar operación<div class="search-input"><input name="q" placeholder="Concepto del movimiento" maxlength="80">${icon('search')}</div></label><button class="button" type="submit">Buscar</button></form><div id="movement-results" aria-live="polite"></div><div class="pagination"><span id="result-count"></span><div><button class="text-link" id="prev-page">Anterior</button><button class="text-link" id="next-page">Siguiente ${icon('arrow')}</button></div></div></section>`);
  const form = document.querySelector('#movement-filters');
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    document.querySelector('#prev-page').disabled = true;
    document.querySelector('#next-page').disabled = true;
    form.querySelector('[type=submit]').disabled = true;
    document.querySelector('#movement-results').setAttribute('aria-busy', 'true');
    const params = new URLSearchParams(new FormData(form)); params.set('page', state.page);
    try {
      const result = await api('/transactions?' + params);
      document.querySelector('#movement-results').innerHTML = movementTable(result.items);
      document.querySelector('#result-count').textContent = `${result.total} movimientos · Página ${state.page}`;
      document.querySelector('#prev-page').disabled = state.page <= 1;
      document.querySelector('#next-page').disabled = state.page * 15 >= result.total;
    } catch (error) {
      document.querySelector('#movement-results').innerHTML = `<div class="empty-state"><p>${esc(error.message)}</p><button class="text-link" id="retry-movements">Intentar de nuevo</button></div>`;
      document.querySelector('#retry-movements').onclick = load;
    } finally {
      loading = false;
      form.querySelector('[type=submit]').disabled = false;
      document.querySelector('#movement-results').setAttribute('aria-busy', 'false');
    }
  }
  form.onsubmit = event => { event.preventDefault(); if (!loading) { state.page = 1; load(); } };
  document.querySelector('#prev-page').onclick = () => { if (!loading) { state.page--; load(); } };
  document.querySelector('#next-page').onclick = () => { if (!loading) { state.page++; load(); } };
  await load();
}

async function transferPage() {
  const beneficiaries = await api('/beneficiaries'); state.beneficiaries = beneficiaries;
  const accounts = state.overview.accounts;
  shell('Mueve lo que importa.', '/transferir', `<div class="transfer-layout"><section class="panel transfer-panel"><div class="step-indicator"><span class="current">01 <b>Datos</b></span><i></i><span>02 <b>Confirmación</b></span><i></i><span>03 <b>Comprobante</b></span></div><div id="transfer-stage"><h2>Nueva transferencia</h2><form id="transfer-form"><label>Cuenta de origen<select name="from_account">${accounts.map(a => `<option value="${a.id}">${esc(a.name)} · ${money(a.balance)}</option>`).join('')}</select></label><label>Cuenta de destino<select name="to_account"><optgroup label="Mis cuentas">${accounts.map(a => `<option value="${a.id}">${esc(a.name)} · ${a.clabe.slice(-4)}</option>`).join('')}</optgroup>${beneficiaries.items.length ? `<optgroup label="Beneficiarios">${beneficiaries.items.map(b => `<option value="${b.account_id}">${esc(b.alias)} · ${b.clabe.slice(-4)}</option>`).join('')}</optgroup>` : ''}</select></label><a class="small-link" href="${base}/beneficiarios">Administrar beneficiarios ${icon('plus')}</a><label>Importe<div class="money-input"><span>$</span><input name="amount" aria-label="Importe" inputmode="decimal" placeholder="0.00" pattern="[0-9]+([.][0-9]{1,2})?" required><span>MXN</span></div></label><label>Concepto<input name="concept" placeholder="Concepto de la transferencia" minlength="2" maxlength="80" required></label><p class="form-error" id="transfer-error" role="alert"></p><button class="button full" type="submit">Continuar ${icon('arrow')}</button></form></div></section><aside class="transfer-aside"><img src="/assets/advisor.webp" alt="Asesor de Aluranee Bank"><h3>En cada movimiento,<br>tu tranquilidad.</h3><div>${icon('lock')}<span>Verifica la cuenta y el importe antes de confirmar.</span></div><p>Las operaciones de este entorno son simuladas.</p></aside></div>`);
  document.querySelector('[name=to_account]').selectedIndex = 1;
  if (state.transfer) {
    for (const name of ['from_account', 'to_account', 'concept']) document.querySelector(`[name=${name}]`).value = state.transfer[name];
    document.querySelector('[name=amount]').value = (state.transfer.amount / 100).toFixed(2);
  }
  document.querySelector('#transfer-form').onsubmit = event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const [whole, fraction = ''] = form.amount.split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    const source = accounts.find(a => a.id === form.from_account);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 50000000) { document.querySelector('#transfer-error').textContent = 'Ingresa un importe entre $0.01 y $500,000.00.'; return; }
    if (form.from_account === form.to_account) { document.querySelector('#transfer-error').textContent = 'Selecciona una cuenta de destino diferente.'; return; }
    if (source.balance < amount) { document.querySelector('#transfer-error').textContent = 'El saldo disponible es insuficiente.'; return; }
    state.transfer = {...form, amount}; state.key = crypto.randomUUID();
    confirmTransfer();
  };
}

function confirmTransfer() {
  const t = state.transfer;
  const source = state.overview.accounts.find(a => a.id === t.from_account);
  const target = state.overview.accounts.find(a => a.id === t.to_account) || state.beneficiaries.items.find(b => b.account_id === t.to_account);
  document.querySelector('.step-indicator').children[0].classList.remove('current');
  document.querySelector('.step-indicator').children[2].classList.add('current');
  document.querySelector('#transfer-stage').innerHTML = `<h2>Confirma tu operación</h2><div class="confirm-amount">${money(t.amount)}<span>MXN</span></div><dl class="receipt-facts"><div><dt>Desde</dt><dd>${esc(source.name)}</dd></div><div><dt>Hacia</dt><dd>${esc(target.name || target.alias)}<br><small>${esc(target.clabe)}</small></dd></div><div><dt>Concepto</dt><dd>${esc(t.concept)}</dd></div><div><dt>Comisión</dt><dd>$0.00</dd></div></dl><p class="form-error" id="transfer-error" role="alert"></p><button class="button full" id="confirm-transfer">Confirmar transferencia ${icon('arrow')}</button><button class="text-link centered" id="edit-transfer">Volver a los datos</button>`;
  document.querySelector('#edit-transfer').onclick = () => transferPage().catch(error => notify(error.message));
  document.querySelector('#confirm-transfer').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      const receipt = await api('/transfers', {method: 'POST', headers: {'Idempotency-Key': state.key}, body: JSON.stringify(t)});
      transferReceipt(receipt, target);
      state.overview = await api('/overview');
    } catch (error) { const feedback = document.querySelector('#transfer-error'); if (feedback) feedback.textContent = error.message; else notify(error.message); button.disabled = false; }
  };
}

function transferReceipt(receipt, target) {
  document.querySelector('.step-indicator').children[2].classList.remove('current');
  document.querySelector('.step-indicator').children[4].classList.add('current');
  document.querySelector('#transfer-stage').innerHTML = `<div class="transfer-success"><div class="success-mark">${icon('check')}</div><h2>Transferencia aplicada.</h2><strong>${money(receipt.amount)}</strong><p>${esc(target.name || target.alias)}</p></div><dl class="receipt-facts"><div><dt>Referencia</dt><dd>${esc(receipt.reference)}</dd></div><div><dt>Fecha</dt><dd>${date(receipt.created_at)}</dd></div><div><dt>Concepto</dt><dd>${esc(receipt.concept)}</dd></div></dl><button class="button full" id="download-receipt">Descargar comprobante ${icon('download')}</button><a class="text-link centered" href="${base}">Volver al inicio</a>`;
  document.querySelector('#download-receipt').onclick = async event => {
    const downloadButton = event.currentTarget; downloadButton.disabled = true;
    try { await api('/transfers/' + receipt.id + '/receipt', {download: 'comprobante-aluranee.txt'}); }
    catch (error) { notify(error.message); }
    finally { downloadButton.disabled = false; }
  };
}

async function beneficiariesPage() {
  const result = await api('/beneficiaries');
  shell('Personas de confianza.', '/beneficiarios', `<div class="beneficiaries-layout"><section class="panel"><div class="panel-heading"><h2>Mis beneficiarios</h2><span>${result.items.length} registrados</span></div>${result.items.length ? result.items.map(b => `<div class="beneficiary-row"><span class="avatar">${esc(b.alias[0])}</span><div><strong>${esc(b.alias)}</strong><span>${esc(b.clabe)}</span></div><button class="icon-button delete-beneficiary" data-id="${b.id}" aria-label="Eliminar ${esc(b.alias)}">${icon('close')}</button></div>`).join('') : '<div class="empty-state">Agrega una cuenta para realizar tu primera transferencia.</div>'}</section><section class="panel"><h2>Agregar beneficiario</h2><form id="beneficiary-form"><label>Cuenta del directorio<select id="directory"><option value="">Selecciona una cuenta</option>${result.directory.map(b => `<option value="${b.clabe}">${esc(b.name)}</option>`).join('')}</select></label><label>CLABE de simulación<input name="clabe" inputmode="numeric" pattern="990[0-9]{15}" maxlength="18" required></label><label>Alias<input name="alias" minlength="2" maxlength="60" required></label><p class="form-error" id="beneficiary-error" role="alert"></p><button class="button full" type="submit">Guardar beneficiario ${icon('plus')}</button></form></section></div>`);
  document.querySelector('#directory').onchange = event => { document.querySelector('[name=clabe]').value = event.target.value; document.querySelector('[name=alias]').value = event.target.selectedOptions[0].textContent; };
  document.querySelector('#beneficiary-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { await api('/beneficiaries', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); await beneficiariesPage(); notify('Beneficiario guardado.'); }
    catch (error) { document.querySelector('#beneficiary-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  document.querySelectorAll('.delete-beneficiary').forEach(button => button.onclick = () => {
    const id = button.dataset.id;
    dialog('<h2>Eliminar beneficiario</h2><p>La cuenta se quitará de tu lista de beneficiarios.</p><button class="button full" id="confirm-delete">Eliminar</button>');
    document.querySelector('#confirm-delete').onclick = async () => { try { await api('/beneficiaries/' + id, {method: 'DELETE'}); modal.close(); await beneficiariesPage(); notify('Beneficiario eliminado.'); } catch (error) { notify(error.message); } };
  });
}

function cardsPage() {
  shell('Tu tarjeta. Tu control.', '/tarjetas', `<div class="cards-layout">${state.overview.cards.map(card => `<section class="panel card-detail">${bankCard(card)}<div class="panel-heading"><h2>Débito Patrimonial</h2><span class="status ${card.frozen ? 'paused' : ''}">${card.frozen ? 'Pausada' : 'Activa'}</span></div><div class="card-control"><div><strong>Pausar tarjeta</strong><p>Bloqueo temporal de operaciones.</p></div><button class="switch ${card.frozen ? 'on' : ''}" role="switch" aria-checked="${Boolean(card.frozen)}" aria-label="Pausar tarjeta" data-id="${card.id}" data-frozen="${card.frozen}"><span></span></button></div><div class="card-limit"><span>Cuenta vinculada</span><strong>Cuenta Patrimonial</strong></div></section>`).join('')}<aside class="editorial-aside"><img src="/assets/executive.webp" alt="Ejecutiva de Aluranee Bank"><h2>La libertad de elegir.<br>La seguridad de decidir.</h2></aside></div>`);
  document.querySelectorAll('.switch').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await api('/cards/' + button.dataset.id, {method: 'PATCH', body: JSON.stringify({frozen: button.dataset.frozen !== '1'})}); state.overview = await api('/overview'); cardsPage(); notify('Estado de tarjeta actualizado.'); }
    catch (error) { button.disabled = false; notify(error.message); }
  });
}

async function supportPage() {
  const data = await api('/support/tickets');
  shell('Estamos para ti.', '/atencion', `<div class="support-layout"><section class="panel"><h2>Mesa de atención</h2><form id="support-form"><label>Asunto<input name="subject" minlength="3" maxlength="80" required></label><label>Mensaje<textarea name="message" minlength="10" maxlength="1500" rows="5" required></textarea></label><p class="form-error" id="support-error" role="alert"></p><button class="button full" type="submit">Enviar solicitud ${icon('arrow')}</button></form></section><section class="panel"><div class="panel-heading"><h2>Mis solicitudes</h2><span>${data.items.length}</span></div>${data.items.map(t => `<article class="ticket"><div><span class="status">${esc(t.status)}</span><time>${date(t.created_at)}</time></div><h3>${esc(t.subject)}</h3><p>${esc(t.message)}</p><button class="text-arrow export-ticket" data-ticket="${t.id}" data-document="${t.document_id}">Descargar expediente ${icon('download')}</button></article>`).join('')}</section></div>`);
  document.querySelector('#support-form').onsubmit = async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { await api('/support/tickets', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); await supportPage(); notify('Solicitud recibida.'); }
    catch (error) { document.querySelector('#support-error').textContent = error.message; button.disabled = false; }
  };
  document.querySelectorAll('.export-ticket').forEach(button => button.onclick = async () => {
    try {
      const data = await api('/support/export', {method: 'POST', body: JSON.stringify({ticket_id: button.dataset.ticket, document_id: button.dataset.document})});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'expediente-aluranee.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notify(error.message); }
  });
}

function profilePage() {
  shell('Tu espacio.', '/perfil', `<section class="panel profile-panel"><div class="avatar large">${esc(state.user.name[0])}</div><h2>${esc(state.user.name)}</h2><dl class="receipt-facts"><div><dt>Identificador</dt><dd>${esc(state.user.email)}</dd></div><div><dt>Tipo de banca</dt><dd>Personal y patrimonial</dd></div><div><dt>Sesión</dt><dd>Privada · 8 horas</dd></div></dl><p class="field-note">Perfil ficticio del laboratorio universitario.</p></section>`);
}

function morePage() {
  shell('A tu servicio.', '/mas', `<section class="panel more-menu">${navigation.filter(([path]) => ['/movimientos', '/beneficiarios', '/atencion'].includes(path)).map(([path, i, label]) => `<a href="${base}${path}">${icon(i)}${label}${icon('chevron')}</a>`).join('')}<a href="${base}/perfil">${icon('user')}Mi perfil${icon('chevron')}</a></section>`);
}

function phonePreview() {
  document.body.className = 'public phone-preview';
  root.innerHTML = `${publicHeader()}<main id="main" class="phone-stage"><div><span class="section-number">ALURANEE MÓVIL</span><h1>Cerca de ti.<br>Donde estés.</h1><p>Tu patrimonio, tus movimientos,<br>tu tranquilidad.</p><a href="/app" class="button button-gold">Abrir Aluranee Móvil ${icon('arrow')}</a><span class="simulation-note">Aplicación web · Operaciones simuladas</span></div><div class="phone"><div class="phone-speaker"></div><iframe src="/app" title="Aluranee Móvil" loading="eager"></iframe><div class="phone-home"></div></div></main>`;
  bindPublic();
}

function informationPage(slug) {
  const page = window.ALURANEE_INFORMATION[slug];
  document.body.className = 'public';
  document.title = page.label + ' · Aluranee Bank';
  root.innerHTML = `${publicHeader()}<main id="main"><section class="information-hero"><div><a class="back-link" href="${site('/')}">← Aluranee Bank</a><span class="section-number">${esc(page.label)}</span><h1>${esc(page.title)}</h1><p>${esc(page.intro)}</p><a class="button button-gold" href="${site(page.action || '/registro')}">${esc(page.actionLabel || 'Abrir mi cuenta')} ${icon('arrow')}</a></div><img src="${site('/assets/' + page.photo)}" alt="${esc(page.alt)}"></section><div class="information-body">${page.sections.map((section, index) => `<section class="information-section"><div><span class="section-number">${String(index + 1).padStart(2, '0')}</span><h2>${esc(section.title)}</h2></div><div>${section.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}${section.items ? `<ul>${section.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}</div></section>`).join('')}<section class="information-contact"><h2>Siempre cerca.</h2><p>Consulta tus movimientos, administra tus cuentas y habla con tu mesa de atención desde la banca en línea.</p><div><a class="button" href="${site('/acceso')}">Entrar a mi banca ${icon('arrow')}</a><a class="text-arrow" href="${site('/ayuda')}">Centro de ayuda ${icon('arrow')}</a></div></section></div></main>${footer()}`;
  bindPublic(); bindPrivacy();
}

function missingPage() {
  document.body.className = 'public';
  document.title = 'Página no encontrada · Aluranee Bank';
  root.innerHTML = `${publicHeader()}<main id="main" class="missing-page"><span class="section-number">404 · ALURANEE BANK</span><h1>Retomemos el camino.</h1><p>La página que buscas no está disponible. Puedes volver al inicio o consultar nuestro centro de ayuda.</p><div><a class="button" href="${site('/')}">Volver al inicio ${icon('arrow')}</a><a class="text-arrow" href="${site('/ayuda')}">Centro de ayuda ${icon('arrow')}</a></div></main>${footer()}`;
  bindPublic();
}

async function start() {
  if (routePath === '/' && config.defaultChannel === 'mobile') { location.replace(site('/app/')); return; }
  const informationSlug = routePath.slice(1);
  if (window.ALURANEE_INFORMATION && Object.hasOwn(window.ALURANEE_INFORMATION, informationSlug)) { informationPage(informationSlug); return; }
  if (routePath === '/') { landing(); return; }
  if (routePath === '/movil') { phonePreview(); return; }
  if (['/acceso', '/registro', '/app/registro'].includes(routePath)) { auth(routePath.includes('registro')); return; }
  const bankingRoot = mobile ? '/app' : '/banca';
  const route = routePath.slice(bankingRoot.length);
  const pages = {'': dashboard, '/cuentas': accountsPage, '/movimientos': transactionsPage, '/transferir': transferPage, '/beneficiarios': beneficiariesPage, '/tarjetas': cardsPage, '/atencion': supportPage, '/perfil': profilePage, '/mas': morePage};
  if (!(routePath === bankingRoot || routePath.startsWith(bankingRoot + '/')) || !Object.hasOwn(pages, route)) { missingPage(); return; }
  root.innerHTML = '<main id="main" class="loading"><div class="loading-seal"><img src="/assets/seal.webp" alt="Aluranee Bank"></div><p>Cargando tu banca…</p></main>';
  try {
    state.user = await api('/me'); state.csrf = state.user.csrf;
    state.overview = await api('/overview');
    await pages[route]();
  } catch (error) {
    if (error.status === 401) auth(false);
    else { root.innerHTML = `<main id="main" class="loading"><h1>No pudimos abrir tu banca.</h1><p>${esc(error.message)}</p><a class="button" href="${base}">Intentar de nuevo</a></main>`; }
  }
}

start();
