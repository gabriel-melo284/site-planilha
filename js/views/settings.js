// Tela "Ajustes"
import { esc, icon } from '../ui.js';
import { permission } from '../notify.js';
import { redirectUri } from '../google.js';

const ago = (d) => {
  if (!d) return 'nunca';
  const m = Math.round((Date.now() - d.getTime()) / 60e3);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h} h` : d.toLocaleString('pt-BR');
};

const statusRow = (ok, title, detail) =>
  `<div class="status-row"><span class="dot ${ok === true ? '' : ok === false ? 'err' : 'off'}"></span><div class="grow"><b>${title}</b> <span class="muted">${detail || ''}</span></div></div>`;

export function renderSettings(ctx) {
  const { settings: s, data, state } = ctx;
  const o = data.st.outlook;
  const g = data.st.google;
  const h = state.health;
  const acc = data.st.provider.account?.();
  const perm = permission();

  const outlookEvents = o.parsed ? o.parsed.series.length : 0;

  const bridgeCard = `<div class="card">
    <h3>Conexão</h3>
    <p class="muted">A ponte (Cloudflare Worker) busca o calendário do Outlook e faz o login do Google com segurança. Veja o <a href="https://github.com/gabriel-melo284/site-planilha#readme" target="_blank" rel="noopener noreferrer">passo a passo</a>.</p>
    <form data-form="bridge">
      <label class="field"><span>URL da ponte</span>
        <input class="input" name="workerUrl" type="url" placeholder="https://agenda-ponte.seunome.workers.dev" value="${esc(s.workerUrl)}" autocomplete="off" required></label>
      <label class="field"><span>Chave de acesso</span>
        <input class="input" name="accessKey" type="password" placeholder="a mesma ACCESS_KEY do Worker" value="${esc(s.accessKey)}" autocomplete="off" required></label>
      <div class="row" style="flex-wrap:wrap"><button class="btn btn-primary" type="submit" style="flex:none">Salvar e testar</button></div>
    </form>
    <div style="margin-top:14px">
      ${h ? statusRow(h.ok ? true : false, 'Ponte', h.ok ? 'conectada' : esc(h.error || 'falhou')) : statusRow(null, 'Ponte', s.workerUrl ? 'não testada' : 'não configurada')}
      ${h?.ok ? statusRow(h.ics, 'Outlook (ICS_URL)', h.ics ? 'configurado' : 'falta definir ICS_URL no Worker') : ''}
      ${h?.ok ? statusRow(h.google, 'Google (Client ID/Secret)', h.google ? 'configurado' : 'falta definir no Worker') : ''}
    </div>
  </div>`;

  const googleCals = data.st.calendars
    .map((c) => {
      const cs = s.calendars[c.id] || {};
      const color = cs.color || c.color;
      return `<div class="cal-setting">
        <label class="check"><input type="checkbox" data-cal-visible="${esc(c.id)}" ${cs.visible ? 'checked' : ''}></label>
        <input type="color" value="${esc(color)}" data-cal-color="${esc(c.id)}" aria-label="Cor de ${esc(c.name)}">
        <span class="grow">${esc(c.name)} ${c.writable ? '' : '<span class="faint">(somente leitura)</span>'}</span>
        ${c.writable ? `<label class="check faint" title="Agenda padrão para novos compromissos"><input type="radio" name="defcal" data-cal-default="${esc(c.id)}" ${s.defaultCalendar === c.id ? 'checked' : ''}> padrão</label>` : ''}
      </div>`;
    })
    .join('');

  const googleCard = `<div class="card">
    <h3>Google — compromissos pessoais e demandas</h3>
    ${s.demo
      ? '<p class="muted">Modo demonstração ativo: os dados pessoais são fictícios.</p>'
      : data.googleOn()
        ? `${statusRow(!g.error, 'Conectado', `${esc(acc?.email || '')} · sincronizado ${ago(g.lastSync)}${g.error ? ' · ' + esc(g.error) : ''}`)}
           <div style="margin:10px 0 4px"><button class="btn btn-sm btn-danger-ghost" data-act="google-logout">Desconectar</button></div>`
        : `<p class="muted">${data.st.provider.isExpired?.() ? 'A autorização expirou. ' : ''}Conecte para ver e criar compromissos no Google Agenda e usar o Google Tasks como lista de demandas.</p>
           <button class="btn btn-primary" data-act="google-login" ${s.workerUrl ? '' : 'disabled'}>Conectar Google</button>
           <p class="hint" style="margin-top:10px">URI de redirecionamento para cadastrar no Google Cloud: <code>${esc(redirectUri())}</code></p>`}
    ${data.st.calendars.length ? `<div class="field-label" style="margin-top:14px">Agendas exibidas</div>${googleCals}` : ''}
    ${data.st.taskLists.length ? `<label class="field" style="margin-top:14px"><span>Lista padrão para novas demandas</span>
      <select class="input" data-setting="taskList">${data.st.taskLists.map((l) => `<option value="${esc(l.id)}" ${s.taskList === l.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>` : ''}
  </div>`;

  const workCard = `<div class="card">
    <h3>Trabalho — Outlook</h3>
    ${statusRow(o.error ? false : o.parsed ? true : null, o.parsed ? `${outlookEvents} séries de eventos` : 'Sem dados', `${o.error ? esc(o.error) + ' · ' : ''}atualizado ${ago(o.lastSync)}`)}
    <div class="row" style="margin-top:10px">
      <label class="field"><span>Nome</span><input class="input" data-setting="workName" value="${esc(s.workName)}"></label>
      <label class="field" style="flex:none"><span>Cor</span><input class="input" type="color" data-setting="workColor" value="${esc(s.workColor)}" style="width:56px;padding:4px"></label>
    </div>
    <div class="row">
      <label class="field"><span>Atualizar a cada</span>
        <select class="input" data-setting="refreshMin" data-num>${[2, 5, 10, 15, 30].map((m) => `<option value="${m}" ${s.refreshMin === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
      <div class="field" style="justify-content:flex-end"><button class="btn" data-act="refresh">${icon('refresh')}Atualizar agora</button></div>
    </div>
    <p class="hint" style="margin:0">As reuniões do Outlook são somente leitura aqui; responda convites no próprio Outlook.</p>
  </div>`;

  const lookCard = `<div class="card">
    <h3>Aparência e calendário</h3>
    <div class="field"><span>Tema</span>
      <div class="segmented">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button data-theme-set="${v}" class="${s.theme === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
    <div class="row">
      <label class="field"><span>Semana começa em</span>
        <select class="input" data-setting="weekStart" data-num><option value="0" ${s.weekStart === 0 ? 'selected' : ''}>Domingo</option><option value="1" ${s.weekStart === 1 ? 'selected' : ''}>Segunda</option></select></label>
      <label class="field"><span>Rolar o dia até</span>
        <select class="input" data-setting="dayStartHour" data-num>${[5, 6, 7, 8, 9, 10].map((hh) => `<option value="${hh}" ${s.dayStartHour === hh ? 'selected' : ''}>${hh}:00</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>Cor das demandas</span><input class="input" type="color" data-setting="taskColor" value="${esc(s.taskColor)}" style="width:56px;padding:4px"></label>
    </div>
  </div>`;

  const notifyCard = `<div class="card">
    <h3>Lembretes</h3>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" data-notify="enabled" ${s.notify.enabled ? 'checked' : ''}> Avisar antes de compromissos e prazos</label>
    ${perm === 'denied' ? '<div class="warn-box">' + icon('alert') + '<span>As notificações estão bloqueadas no navegador. Libere nas configurações do site.</span></div>' : ''}
    ${perm === 'unsupported' ? '<div class="warn-box">' + icon('alert') + '<span>Este navegador não suporta notificações. No iPhone, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início).</span></div>' : ''}
    <div class="row">
      <label class="field"><span>Antecedência</span>
        <select class="input" data-notify="lead">${[0, 1, 5, 10, 15, 30, 60].map((m) => `<option value="${m}" ${Number(s.notify.lead) === m ? 'selected' : ''}>${m ? m + ' min antes' : 'Na hora'}</option>`).join('')}</select></label>
      <label class="field"><span>Resumo de demandas às</span>
        <input class="input" type="time" data-notify="taskTime" value="${esc(s.notify.taskTime)}"></label>
    </div>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" data-notify="tasks" ${s.notify.tasks ? 'checked' : ''}> Avisar demandas que vencem hoje</label>
    <div><button class="btn btn-sm" data-act="test-notify">${icon('bell')}Testar aviso</button></div>
    <p class="hint" style="margin:10px 0 0">Os lembretes funcionam com o app aberto (pode estar em segundo plano). O Outlook e o Google Agenda continuam enviando os avisos deles normalmente.</p>
  </div>`;

  const devicesCard = `<div class="card">
    <h3>Outros dispositivos</h3>
    <p class="muted">Copie o link e abra no celular (ou outro computador): a ponte${data.googleOn() && !s.demo ? ' e a conexão com o Google já vão' : ' já vai'} configurada${data.googleOn() && !s.demo ? 's' : ''}.</p>
    <button class="btn" data-act="copy-config" ${s.workerUrl && !s.demo ? '' : 'disabled'}>${icon('copy')}Copiar link de configuração</button>
    <p class="hint" style="margin:10px 0 14px">O link dá acesso à sua agenda — envie só para você mesmo (ex.: “mensagem para mim”).</p>
    <form data-form="import-config" class="row" style="flex-wrap:wrap">
      <input class="input" name="link" placeholder="…ou cole aqui um link de configuração" autocomplete="off" style="flex:1 1 220px">
      <button class="btn" type="submit" style="flex:none">Importar</button>
    </form>
    <p class="hint" style="margin:10px 0 0">No iPhone com o app instalado na tela inicial, use “colar” aqui dentro do app.</p>
  </div>`;

  const otherCard = `<div class="card">
    <h3>Demonstração e dados</h3>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" data-act-change="demo" ${s.demo ? 'checked' : ''}> Modo demonstração (dados fictícios)</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${s.demo ? '<button class="btn btn-sm" data-act="demo-reset">Restaurar dados de exemplo</button>' : ''}
      <button class="btn btn-sm btn-danger-ghost" data-act="clear-all">${icon('trash')}Apagar dados deste navegador</button>
    </div>
    <p class="hint" style="margin:10px 0 0">Atalhos no computador: <code>T</code> hoje · <code>D</code> <code>S</code> <code>M</code> <code>L</code> visões · <code>←</code> <code>→</code> navegar · <code>N</code> novo.</p>
  </div>`;

  return `<div class="settings">${bridgeCard}${workCard}${googleCard}${notifyCard}${lookCard}${devicesCard}${otherCard}</div>`;
}
