const appUi = {hidden: null, account: 0, tab: 'featured'};
const appPaths = {
  back: 'm14 5-7 7 7 7',
  chat: 'M20 11a8 8 0 0 1-8 8H4v-8a8 8 0 1 1 16 0ZM4 22v-3',
  hidden: 'm3 3 18 18M9.7 5.4A13 13 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-4.2 4.9M6.2 6.2A18 18 0 0 0 2 12s3 7 10 7a13 13 0 0 0 5.8-1.2M10 10a3 3 0 0 0 4 4',
  deposit: 'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',
  chart: 'M4 3v18h17M9 15V9m5 6V5m5 10v-4',
  forward: 'm10 5 7 7-7 7',
};

function appIcon(name) {
  return appPaths[name] ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${appPaths[name]}"/></svg>` : icon(name);
}

function appBalance(value) {
  if (appUi.hidden === null) appUi.hidden = sessionStorage.getItem(sessionKey + ':hidden') === '1';
  return `<span data-app-amount="${value}">${appUi.hidden ? '••••' : money(value)}</span>`;
}

function appNavigation(active) {
  const links = [['', 'home', 'Inicio'], ['/cuentas', 'accounts', 'Cuentas'], ['/transferir', 'transfer', 'Transferir'], ['/tarjetas', 'card', 'Tarjetas'], ['/mas', 'menu', 'Más']];
  return `<nav class="bottom-nav bank-island" aria-label="Navegación móvil">${links.map(([path, symbol, label]) => {
    const selected = active === path || (path === '/mas' && !['', '/cuentas', '/transferir', '/tarjetas'].includes(active));
    return `<a href="${base}${path}" class="${selected ? 'active' : ''}" ${active === path ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`;
  }).join('')}</nav>`;
}

function appMenu() {
  const links = [...navigation.slice(0, 3), ['/depositos', 'plus', 'Depósitos'], ...navigation.slice(3), ['/perfil', 'user', 'Mi perfil']];
  dialog(`<h2>Menú</h2><nav class="bank-dialog-nav" aria-label="Tu banca">${links.map(([path, symbol, label]) => `<a href="${base}${path}">${icon(symbol)}${label}${icon('chevron')}</a>`).join('')}</nav><button class="text-link app-signout" id="app-signout">Cerrar sesión</button>`);
  document.querySelector('#app-signout').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await api('/auth/logout', {method: 'POST'}); location.href = base; }
    catch (error) { notify(error.message); button.disabled = false; }
  };
}

function appShell(title, active, content) {
  document.body.className = 'mobile banking app-banking';
  document.querySelector('meta[name=theme-color]').content = '#f6f7f9';
  const titles = {'': 'Inicio', '/cuentas': 'Cuentas', '/movimientos': 'Movimientos', '/transferir': 'Transferir', '/tarjetas': 'Tarjetas', '/beneficiarios': 'Beneficiarios', '/atencion': 'Ayuda', '/perfil': 'Mi perfil', '/mas': 'Menú', '/ingresos': 'Ingresos y gastos', '/depositos': 'Depósitos'};
  const heading = titles[active] || title.replace(/[.]$/, '');
  document.title = heading + ' · Aluranee Bank';
  const home = active === '';
  const visibility = `<button class="app-header-control" id="app-visibility" aria-label="${appUi.hidden ? 'Mostrar saldos' : 'Ocultar saldos'}" aria-pressed="${Boolean(appUi.hidden)}"><span class="app-control-circle">${appIcon(appUi.hidden ? 'hidden' : 'eye')}</span><span id="app-visibility-label">${appUi.hidden ? 'Oculto' : 'Visible'}</span></button>`;
  root.innerHTML = `<header class="app-header ${home ? 'app-header-home' : ''}">${home ? visibility : `<a class="app-header-control" href="${base}" aria-label="Volver a Inicio"><span class="app-control-circle">${appIcon('back')}</span></a>`}<h1>${esc(heading)}</h1><div class="app-header-actions">${home ? `<a class="app-header-control" href="${base}/atencion"><span class="app-control-circle">${appIcon('chat')}</span><span>Ayuda</span></a>` : ''}<button class="app-header-control" id="app-menu" aria-haspopup="dialog"><span class="app-control-circle">${icon('menu')}</span><span>Menú</span></button></div></header><main id="main" class="app-bank-content">${content}</main><footer class="app-footer">Operaciones simuladas</footer>${appNavigation(active)}`;
  document.querySelector('#app-menu').onclick = appMenu;
  document.querySelector('#app-visibility')?.addEventListener('click', event => {
    appUi.hidden = !appUi.hidden;
    sessionStorage.setItem(sessionKey + ':hidden', appUi.hidden ? '1' : '0');
    document.querySelectorAll('[data-app-amount]').forEach(element => { element.textContent = appUi.hidden ? '••••' : money(Number(element.dataset.appAmount)); });
    const button = event.currentTarget;
    button.setAttribute('aria-label', appUi.hidden ? 'Mostrar saldos' : 'Ocultar saldos');
    button.setAttribute('aria-pressed', String(appUi.hidden));
    button.querySelector('.app-control-circle').innerHTML = appIcon(appUi.hidden ? 'hidden' : 'eye');
    document.querySelector('#app-visibility-label').textContent = appUi.hidden ? 'Oculto' : 'Visible';
  });
}

function appProductCard(account) {
  return `<article class="app-product-card" aria-label="${esc(account.name)}"><div class="app-product-identity"><h3>${esc(state.user.name)}</h3><span>·${esc(account.clabe.slice(-4))}</span></div><div class="app-product-balance ${money(account.balance).length > 14 ? 'app-balance-compact' : ''}">${appBalance(account.balance)}<span class="app-balance-label">Saldo disponible</span></div><div class="app-product-links"><a href="${base}/movimientos?account=${account.id}">Ver últimos movimientos</a><a href="${base}/ingresos?account=${account.id}">Ver ingresos y gastos</a></div></article>`;
}

function appDashboard() {
  const {accounts, cards, transactions} = state.overview;
  const requested = new URLSearchParams(location.search).get('account');
  const requestedIndex = accounts.findIndex(account => account.id === requested);
  if (requestedIndex >= 0) appUi.account = requestedIndex;
  appUi.account = Math.max(0, Math.min(appUi.account, accounts.length - 1));
  const productList = accounts.map(account => `<a class="app-product-row" href="${base}/movimientos?account=${account.id}"><span class="app-product-symbol">${icon('accounts')}</span><span><strong>${esc(account.name)}</strong><small>·${esc(account.clabe.slice(-4))}</small></span><span class="app-product-row-amount">${appBalance(account.balance)}</span>${icon('chevron')}</a>`).join('');
  const cardList = cards.map(card => `<a class="app-product-row" href="${base}/tarjetas"><span class="app-product-symbol">${icon('card')}</span><span><strong>Débito Patrimonial</strong><small>·${esc(card.last_four)}</small></span><span class="app-product-status">${card.frozen ? 'Pausada' : 'Activa'}</span>${icon('chevron')}</a>`).join('');
  appShell('Inicio', '', `<div class="app-product-tabs" role="tablist" aria-label="Productos"><button role="tab" id="tab-featured" aria-controls="panel-featured" aria-selected="${appUi.tab === 'featured'}" tabindex="${appUi.tab === 'featured' ? 0 : -1}">Destacados</button><button role="tab" id="tab-products" aria-controls="panel-products" aria-selected="${appUi.tab === 'products'}" tabindex="${appUi.tab === 'products' ? 0 : -1}">Tus productos</button></div><section id="panel-featured" role="tabpanel" aria-labelledby="tab-featured" ${appUi.tab !== 'featured' ? 'hidden' : ''}><div class="app-section-heading"><h2>Principales productos</h2><a href="${base}/depositos" id="app-deposits-link">Depósitos</a></div><div class="app-product-carousel" id="app-product-carousel">${accounts.map(appProductCard).join('')}</div><div class="app-product-pagination"><span id="app-product-position">${appUi.account + 1} de ${accounts.length}</span><div><button class="icon-button" id="app-product-prev" aria-label="Cuenta anterior">${appIcon('back')}</button><button class="icon-button" id="app-product-next" aria-label="Cuenta siguiente">${appIcon('forward')}</button></div></div></section><section id="panel-products" role="tabpanel" aria-labelledby="tab-products" ${appUi.tab !== 'products' ? 'hidden' : ''}><div class="app-section-heading"><h2>Tus productos</h2><a href="${base}/depositos">Depósitos</a></div><div class="app-products-list">${productList}${cardList}</div></section><div class="app-quick-actions"><a href="${base}/transferir"><span>${icon('transfer')}</span>Transferir</a><a href="${base}/depositos"><span>${appIcon('deposit')}</span>Depósitos</a><a href="${base}/tarjetas"><span>${icon('card')}</span>Tarjetas</a></div><section class="app-recent"><div class="app-section-heading"><h2>Últimos movimientos</h2><a href="${base}/movimientos">Ver todos</a></div>${movementTable(transactions.slice(0, 3))}</section>`);
  const tabs = [document.querySelector('#tab-featured'), document.querySelector('#tab-products')];
  function selectTab(index) {
    appUi.tab = index ? 'products' : 'featured';
    tabs.forEach((tab, position) => { tab.setAttribute('aria-selected', String(position === index)); tab.tabIndex = position === index ? 0 : -1; });
    document.querySelector('#panel-featured').hidden = index !== 0;
    document.querySelector('#panel-products').hidden = index !== 1;
    if (!index) requestAnimationFrame(() => scrollAccount(appUi.account, false));
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(index);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      selectTab(next); tabs[next].focus();
    };
  });
  const carousel = document.querySelector('#app-product-carousel');
  const accountCards = [...carousel.querySelectorAll('.app-product-card')];
  function updatePager() {
    document.querySelector('#app-product-position').textContent = `${appUi.account + 1} de ${accounts.length}`;
    document.querySelector('#app-product-prev').disabled = appUi.account <= 0;
    document.querySelector('#app-product-next').disabled = appUi.account >= accounts.length - 1;
    document.querySelector('#app-deposits-link').href = base + '/depositos?account=' + accounts[appUi.account].id;
  }
  function scrollAccount(index, animate = true) {
    const position = Math.max(0, Math.min(index, accountCards.length - 1));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    carousel.scrollTo({left: accountCards[position].offsetLeft - accountCards[0].offsetLeft, behavior: animate && !reduced ? 'smooth' : 'auto'});
    appUi.account = position; updatePager();
  }
  let scrollFrame;
  carousel.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      let closest = 0;
      accountCards.forEach((card, index) => { if (Math.abs(card.offsetLeft - accountCards[0].offsetLeft - carousel.scrollLeft) < Math.abs(accountCards[closest].offsetLeft - accountCards[0].offsetLeft - carousel.scrollLeft)) closest = index; });
      appUi.account = closest; updatePager();
    });
  }, {passive: true});
  document.querySelector('#app-product-prev').onclick = () => scrollAccount(appUi.account - 1);
  document.querySelector('#app-product-next').onclick = () => scrollAccount(appUi.account + 1);
  updatePager();
  if (appUi.account) requestAnimationFrame(() => scrollAccount(appUi.account, false));
}

function appDepositsPage() {
  const accounts = state.overview.accounts;
  const requested = new URLSearchParams(location.search).get('account');
  const selected = accounts.find(account => account.id === requested) || accounts[0];
  appShell('Depósitos', '/depositos', `<section class="app-deposit-panel"><form id="app-deposit-form"><label>Cuenta<select name="account_id">${accounts.map(account => `<option value="${account.id}" ${account.id === selected.id ? 'selected' : ''}>${esc(account.name)} · ${esc(account.clabe.slice(-4))}</option>`).join('')}</select></label><label class="app-deposit-amount-label">Importe<div class="app-deposit-amount"><span>$</span><input name="amount" aria-label="Importe del depósito" inputmode="decimal" placeholder="0.00" pattern="[0-9]+([.,][0-9]{1,2})?" maxlength="12" autocomplete="off" required></div></label><p class="form-error" id="app-deposit-error" role="alert"></p><button class="button full" type="submit">Depositar ${appIcon('forward')}</button><p class="app-form-note">Depósito simulado</p></form></section>`);
  let key = '';
  let previousPayload = '';
  document.querySelector('#app-deposit-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type=submit]');
    if (button.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    const [whole, fraction = ''] = data.amount.replace(',', '.').split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    const errorElement = document.querySelector('#app-deposit-error');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) { errorElement.textContent = 'Ingresa un importe entre $0.01 y $10,000,000.00.'; return; }
    const payload = JSON.stringify({account_id: data.account_id, amount});
    if (payload !== previousPayload) { key = crypto.randomUUID(); previousPayload = payload; }
    button.disabled = true; form.setAttribute('aria-busy', 'true'); errorElement.textContent = '';
    try {
      const result = await api('/deposits', {method: 'POST', headers: {'Idempotency-Key': key}, body: payload});
      const account = accounts.find(item => item.id === result.account_id);
      account.balance = result.balance;
      appShell('Depósito', '/depositos', `<section class="app-deposit-result"><span class="app-deposit-check">${icon('check')}</span><h2>Depósito aplicado</h2><strong>${money(result.amount)}</strong><p>${esc(account.name)}</p><dl class="receipt-facts"><div><dt>Saldo disponible</dt><dd>${money(result.balance)}</dd></div><div><dt>Referencia</dt><dd>${esc(result.reference)}</dd></div></dl><a class="button full" href="${base}?account=${result.account_id}">Volver a Inicio ${appIcon('forward')}</a></section>`);
    } catch (error) { errorElement.textContent = error.message; button.disabled = false; }
    finally { form.setAttribute('aria-busy', 'false'); }
  };
}

function appMonthLabel(value, short = false) {
  const label = new Intl.DateTimeFormat('es-MX', {month: short ? 'short' : 'long', ...(short ? {} : {year: 'numeric'}), timeZone: 'America/Mexico_City'}).format(new Date(value * 1000));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function appIncomePage() {
  const accounts = state.overview.accounts;
  const requested = new URLSearchParams(location.search).get('account');
  const selected = accounts.find(account => account.id === requested) || accounts[0];
  appShell('Ingresos y gastos', '/ingresos', '<div class="app-inline-loading" role="status">Cargando movimientos…</div>');
  try {
    const summary = await api('/accounts/' + selected.id + '/summary');
    appShell('Ingresos y gastos', '/ingresos', `<div class="app-summary-filters"><label>Cuenta<select id="app-summary-account">${accounts.map(account => `<option value="${account.id}" ${account.id === selected.id ? 'selected' : ''}>${esc(account.name)}</option>`).join('')}</select></label><label>Periodo<select id="app-summary-period">${[...summary.months].reverse().map(month => `<option value="${month.period}">${appMonthLabel(month.starts_at)}</option>`).join('')}</select></label></div><section class="app-summary-totals" id="app-summary-totals"></section><section class="app-summary-chart"><h2>Tu actividad</h2><div id="app-summary-chart"></div><div class="app-chart-legend"><span><i></i>Ingresos</span><span><i></i>Gastos</span></div></section><a class="button full" href="${base}/movimientos?account=${selected.id}">Ver movimientos ${appIcon('forward')}</a>`);
    function showPeriod() {
      const period = document.querySelector('#app-summary-period').value;
      const month = summary.months.find(item => item.period === period);
      document.querySelector('#app-summary-totals').innerHTML = `<div><span>Ingresos</span><strong>${appBalance(month.income)}</strong></div><div><span>Gastos</span><strong>${appBalance(month.expenses)}</strong></div><div class="app-summary-net"><span>Balance</span><strong>${appBalance(month.income - month.expenses)}</strong></div>`;
      const maximum = Math.max(1, ...summary.months.flatMap(item => [item.income, item.expenses]));
      const bars = summary.months.map((item, index) => {
        const income = item.income / maximum * 116;
        const expenses = item.expenses / maximum * 116;
        const x = 17 + index * 46;
        return `<g class="${period === item.period ? 'app-chart-selected' : ''}"><rect class="app-chart-income" x="${x}" y="${128 - income}" width="12" height="${income}" rx="4"/><rect class="app-chart-expense" x="${x + 15}" y="${128 - expenses}" width="12" height="${expenses}" rx="4"/><text x="${x + 14}" y="150" text-anchor="middle">${esc(appMonthLabel(item.starts_at, true))}</text></g>`;
      }).join('');
      document.querySelector('#app-summary-chart').innerHTML = `<svg viewBox="0 0 310 166" role="img" aria-label="Ingresos y gastos de los últimos seis meses"><path class="app-chart-grid" d="M8 12h294M8 70h294M8 128h294"/>${bars}</svg>`;
    }
    document.querySelector('#app-summary-account').onchange = event => { location.href = base + '/ingresos?account=' + event.target.value; };
    document.querySelector('#app-summary-period').onchange = showPeriod;
    showPeriod();
  } catch (error) {
    appShell('Ingresos y gastos', '/ingresos', `<section class="app-error-panel"><p>${esc(error.message)}</p><a class="button full" href="${base}/ingresos?account=${selected.id}">Intentar de nuevo ${appIcon('forward')}</a></section>`);
  }
}
