const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const shortDate=d=>d?new Intl.DateTimeFormat('pt-BR').format(new Date(`${d}T12:00:00`)):'Sem data';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const defaults={name:'',income:0,payday:1,expenses:[],subscriptions:[]};
const safeColor=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'#52605b';
const supabaseClient=supabase.createClient(
 'https://auiasvzouuqwslvhstgs.supabase.co',
 'sb_publishable_vGXeA5hVPUNUI3r4a-Rt9w_r0tlbEq9'
);
let sessionPromise;
const ensureSession=()=>sessionPromise||(sessionPromise=(async()=>{
 const {data:{session},error}=await supabaseClient.auth.getSession();
 if(error)throw error;
 if(session)return session;
 const {data,error:signInError}=await supabaseClient.auth.signInAnonymously();
 if(signInError)throw signInError;
 return data.session;
})().catch(error=>{sessionPromise=null;throw error}));
const subscriptionCatalog=[
 {id:'custom',name:'Outro serviço',mark:'+',color:'#52605b',plans:[]},
 {id:'netflix',name:'Netflix',mark:'N',color:'#e50914',plans:[{id:'ads',name:'Padrão com anúncios',value:20.90,period:'Mensal'},{id:'standard',name:'Padrão',value:44.90,period:'Mensal'},{id:'premium',name:'Premium',value:59.90,period:'Mensal'}]},
 {id:'disney',name:'Disney+',mark:'D+',color:'#113ccf',plans:[{id:'ads',name:'Padrão com anúncios',value:29.90,period:'Mensal'},{id:'standard',name:'Padrão',value:49.90,period:'Mensal'},{id:'premium',name:'Premium',value:69.90,period:'Mensal'},{id:'standard-year',name:'Padrão anual',value:407.90,period:'Anual'},{id:'premium-year',name:'Premium anual',value:587.90,period:'Anual'}]},
 {id:'spotify',name:'Spotify',mark:'S',color:'#1db954',plans:[{id:'student',name:'Universitário',value:12.90,period:'Mensal'},{id:'individual',name:'Individual',value:23.90,period:'Mensal'},{id:'family',name:'Família',value:40.90,period:'Mensal'}]},
 {id:'prime',name:'Amazon Prime',mark:'a',color:'#00a8e1',plans:[{id:'monthly',name:'Mensal',value:19.90,period:'Mensal'},{id:'annual',name:'Anual',value:166.80,period:'Anual'}]},
 {id:'max',name:'Max',mark:'M',color:'#6b3df5',plans:[{id:'ads',name:'Básico com anúncios',value:29.90,period:'Mensal'},{id:'standard',name:'Standard',value:39.90,period:'Mensal'},{id:'platinum',name:'Platinum',value:55.90,period:'Mensal'},{id:'ads-year',name:'Básico anual',value:226.80,period:'Anual'},{id:'standard-year',name:'Standard anual',value:358.80,period:'Anual'},{id:'platinum-year',name:'Platinum anual',value:478.80,period:'Anual'}]},
 {id:'apple-music',name:'Apple Music',mark:'♫',color:'#f43f5e',plans:[{id:'student',name:'Universitário',value:12.90,period:'Mensal'},{id:'individual',name:'Individual',value:23.90,period:'Mensal'},{id:'family',name:'Família',value:40.90,period:'Mensal'}]}
];
const catalogService=id=>subscriptionCatalog.find(service=>service.id===id)||subscriptionCatalog[0];
const guessService=name=>subscriptionCatalog.find(service=>service.id!=='custom'&&(name||'').toLowerCase().includes(service.name.toLowerCase().replace('+','')))||subscriptionCatalog[0];
let state;
try{
 const stored=JSON.parse(localStorage.getItem('equilibra-data')||'null')||{};
 state={...structuredClone(defaults),name:typeof stored.name==='string'?stored.name:'',income:Number.isFinite(Number(stored.income))&&Number(stored.income)>=0?Number(stored.income):0,payday:Number.isInteger(Number(stored.payday))&&Number(stored.payday)>=1&&Number(stored.payday)<=31?Number(stored.payday):1,subscriptions:Array.isArray(stored.subscriptions)?stored.subscriptions:[]};
}catch{state=structuredClone(defaults);localStorage.removeItem('equilibra-data')}
const save=()=>{localStorage.setItem('equilibra-data',JSON.stringify(state));render()};
const toast=t=>{const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)};

const expensePayload=data=>({
 name:String(data.name||'').trim(),
 value:Number(data.value),
 due:data.due||null,
 payment:data.payment||null,
 status:data.status,
 type:data.type,
 frequency:data.type==='recurring'?(data.frequency||'Mensal'):null,
 method:String(data.method||'').trim()||null,
 notes:String(data.notes||'').trim()||null
});

async function loadExpenses(){
 try{
  await ensureSession();
  const {data,error}=await supabaseClient.from('expenses').select('*').order('created_at',{ascending:false});
  if(error)throw error;
  state.expenses=data;
  save();
 }catch(error){console.error(error);state.expenses=[];render();toast('Não foi possível conectar ao banco')}
}

async function createExpense(data){
 await ensureSession();
 const {error}=await supabaseClient.from('expenses').insert(expensePayload(data)).select('id').single();
 if(error)throw error;
}

async function updateExpense(id,data){
 await ensureSession();
 const {error}=await supabaseClient.from('expenses').update(expensePayload(data)).eq('id',id).select('id').single();
 if(error)throw error;
}

async function deleteExpense(id){
 await ensureSession();
 const {error}=await supabaseClient.from('expenses').delete().eq('id',id).select('id').single();
 if(error)throw error;
}

const observer=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('visible')),{threshold:.15});
$$('.reveal').forEach(el=>observer.observe(el));

let ticking=false,lastFocusedElement,lastScrollY=scrollY,scrollSettleTimer,chartSelection='income';
function updateScrollMotion(){
 const y=window.scrollY,max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
 const delta=y-lastScrollY,energy=Math.min(1,Math.abs(delta)/45);
 document.documentElement.style.setProperty('--scroll-energy',energy.toFixed(3));
 document.documentElement.style.setProperty('--scroll-direction',delta<0?-1:1);
 lastScrollY=y;
 $('#scrollProgress').style.transform=`scaleX(${Math.max(0,Math.min(1,y/max))})`;
 const hero=Math.min(1,y/innerHeight);
 document.documentElement.style.setProperty('--hero-scroll',hero.toFixed(3));
 const story=$('.scroll-story'),rect=story.getBoundingClientRect(),travel=story.offsetHeight-innerHeight;
 const progress=Math.max(0,Math.min(1,-rect.top/travel));
 document.documentElement.style.setProperty('--story',progress.toFixed(3));
 const brandReveal=Math.max(0,Math.min(1,(progress-.62)/.18));
 const brandBurst=Math.max(0,Math.min(1,(progress-.86)/.14));
 document.documentElement.style.setProperty('--brand-reveal',brandReveal.toFixed(3));
 document.documentElement.style.setProperty('--brand-burst',brandBurst.toFixed(3));
 $('#storyStep').textContent=String(Math.min(3,Math.floor(progress*3)+1)).padStart(2,'0');
 ticking=false;
}
addEventListener('scroll',()=>{clearTimeout(scrollSettleTimer);scrollSettleTimer=setTimeout(()=>document.documentElement.style.setProperty('--scroll-energy',0),110);if(!ticking){requestAnimationFrame(updateScrollMotion);ticking=true}},{passive:true});
updateScrollMotion();
const motionScene=$('[data-motion-scene]');
if(motionScene&& !matchMedia('(prefers-reduced-motion: reduce)').matches){
 motionScene.addEventListener('pointermove',event=>{const rect=motionScene.getBoundingClientRect();document.documentElement.style.setProperty('--pointer-x',(((event.clientX-rect.left)/rect.width)-.5)*32);document.documentElement.style.setProperty('--pointer-y',(((event.clientY-rect.top)/rect.height)-.5)*32)},{passive:true});
 motionScene.addEventListener('pointerleave',()=>{document.documentElement.style.setProperty('--pointer-x',0);document.documentElement.style.setProperty('--pointer-y',0)},{passive:true});
}

function openApp(){ $('#app').classList.add('open');document.body.style.overflow='hidden';if(!state.name&&!state.income)openOnboarding() }
function closeApp(){ $('#app').classList.remove('open');document.body.style.overflow='';closeDrawer() }
$$('[data-open-app]').forEach(b=>b.onclick=openApp);$('.back-site').onclick=closeApp;

function openDrawer(html){lastFocusedElement=document.activeElement;const content=$('#drawerContent');content.innerHTML=html;const heading=$('h2',content);if(heading){heading.id='drawerTitle';$('#drawer').setAttribute('aria-labelledby','drawerTitle')}$$('label',content).forEach((label,index)=>{const control=label.nextElementSibling;if(control?.matches('input, select, textarea')){control.id=control.id||`drawerField${index}`;label.htmlFor=control.id}});$('#overlay').classList.add('open');$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');requestAnimationFrame(()=>$('#drawerContent input, #drawerContent select, #drawerContent button')?.focus())}
function closeDrawer(){const wasOpen=$('#drawer').classList.contains('open');$('#overlay').classList.remove('open');$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');if(wasOpen)lastFocusedElement?.focus?.();lastFocusedElement=null}
$('#closeDrawer').onclick=closeDrawer;$('#overlay').onclick=closeDrawer;
addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#drawer').classList.contains('open'))closeDrawer()});

function openOnboarding(){
 openDrawer(`<span class="eyebrow dark">Primeiros passos</span><h2>Vamos montar seu Equilibra</h2><p class="intro">Leva menos de um minuto. Você poderá alterar tudo depois.</p><div class="progress"><span style="width:60%"></span></div><form id="onboardForm"><div class="field"><label>Como podemos chamar você?</label><input name="name" value="${escapeHtml(state.name)}" placeholder="Seu nome" required></div><div class="field"><label>Qual é sua renda mensal?</label><input name="income" type="number" min="0" step="0.01" value="${state.income||''}" placeholder="R$ 0,00" required></div><div class="field"><label>Em que dia você recebe?</label><input name="payday" type="number" min="1" max="31" value="${state.payday}" required></div><button class="btn btn-primary">Continuar para o dashboard →</button></form>`);
 $('#onboardForm').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target);state.name=d.get('name');state.income=Number(d.get('income'));state.payday=Number(d.get('payday'));save();closeDrawer();toast('Seu Equilibra está pronto!')}
}
function openIncome(){openDrawer(`<span class="eyebrow dark">Renda</span><h2>Editar renda mensal</h2><p class="intro">O saldo disponível será recalculado automaticamente.</p><form id="incomeForm"><div class="field"><label>Valor da renda</label><input name="income" type="number" min="0" step="0.01" value="${state.income||''}" required></div><div class="field"><label>Dia do recebimento</label><input name="payday" type="number" min="1" max="31" value="${state.payday}" required></div><button class="btn btn-primary">Salvar alterações</button></form>`);$('#incomeForm').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target);state.income=Number(d.get('income'));state.payday=Number(d.get('payday'));save();closeDrawer();toast('Renda atualizada')}}
function openProfile(){openDrawer(`<span class="eyebrow dark">Perfil</span><h2>Seus dados</h2><p class="intro">Personalize como o Equilibra conversa com você.</p><form id="profileForm"><div class="field"><label>Nome de exibição</label><input name="name" value="${escapeHtml(state.name)}" required maxlength="80"></div><button class="btn btn-primary">Salvar nome</button></form>`);$('#profileForm').onsubmit=e=>{e.preventDefault();state.name=String(new FormData(e.target).get('name')).trim();save();closeDrawer();toast('Nome atualizado')}}
function expenseForm(item={}){return `<span class="eyebrow dark">Despesas</span><h2>${item.id?'Editar':'Nova'} despesa</h2><p class="intro">O nome identifica e organiza o gasto. Forma de pagamento e observações são opcionais.</p><form id="expenseForm"><div class="field"><label>Nome da despesa</label><input name="name" value="${escapeHtml(item.name)}" required maxlength="120"></div><div class="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" value="${item.value??''}" required></div><div class="form-row"><div class="field"><label>Vencimento</label><input name="due" type="date" value="${item.due||''}"></div><div class="field"><label>Data do pagamento</label><input name="payment" type="date" value="${item.payment||''}"></div></div><div class="form-row"><div class="field"><label>Status</label><select name="status"><option value="pending">Pendente</option><option value="paid" ${item.status==='paid'?'selected':''}>Pago</option></select></div><div class="field"><label>Tipo</label><select name="type" id="expenseType"><option value="single">Única</option><option value="recurring" ${item.type==='recurring'?'selected':''}>Recorrente</option></select></div></div><div class="field" id="frequencyField"><label>Frequência da recorrência</label><select name="frequency"><option ${item.frequency==='Mensal'?'selected':''}>Mensal</option><option ${item.frequency==='Semanal'?'selected':''}>Semanal</option><option ${item.frequency==='Anual'?'selected':''}>Anual</option></select></div><div class="field"><label>Forma de pagamento (opcional)</label><input name="method" value="${escapeHtml(item.method)}" maxlength="80"></div><div class="field"><label>Observações (opcional)</label><textarea name="notes" maxlength="500">${escapeHtml(item.notes)}</textarea></div><button type="submit" class="btn btn-primary">Salvar despesa</button></form>`}
function openExpense(item={}){openDrawer(expenseForm(item));const type=$('#expenseType'),frequency=$('#frequencyField');const syncFrequency=()=>frequency.classList.toggle('hidden',type.value!=='recurring');type.onchange=syncFrequency;syncFrequency();$('#expenseForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;button.textContent='Salvando…';const d=Object.fromEntries(new FormData(e.target));try{if(item.id)await updateExpense(item.id,d);else await createExpense(d);await loadExpenses();closeDrawer();toast(item.id?'Despesa atualizada no banco':'Despesa adicionada ao banco')}catch(error){console.error(error);toast('Erro ao salvar a despesa');button.disabled=false;button.textContent='Salvar despesa'}}}
function openSubscription(item={}){
 const initialService=item.serviceId?catalogService(item.serviceId):guessService(item.name);
 const serviceOptions=subscriptionCatalog.map(service=>`<option value="${service.id}" ${service.id===initialService.id?'selected':''}>${service.name}</option>`).join('');
 openDrawer(`<span class="eyebrow dark">Assinaturas</span><h2>${item.id?'Editar':'Adicionar'} assinatura</h2><p class="intro">Escolha um serviço e um plano para preencher mais rápido, ou cadastre outro livremente.</p><form id="subForm"><div class="field"><label>Serviço</label><select name="serviceId" id="subscriptionService">${serviceOptions}</select></div><div class="field" id="subscriptionPlanField"><label>Plano</label><select name="planId" id="subscriptionPlan"></select></div><div class="field" id="customSubscriptionName"><label>Nome da assinatura</label><input name="name" value="${escapeHtml(item.name)}" placeholder="Ex.: academia, jornal, aplicativo" maxlength="120"></div><div class="form-row"><div class="field"><label>Valor</label><input name="value" id="subscriptionValue" type="number" min="0" step="0.01" value="${item.value??''}" required><small class="field-hint">Valor sugerido e sempre editável.</small></div><div class="field"><label>Periodicidade</label><select name="period" id="subscriptionPeriod"><option ${item.period==='Mensal'?'selected':''}>Mensal</option><option ${item.period==='Anual'?'selected':''}>Anual</option></select></div></div><div class="field"><label>Próxima cobrança</label><input name="next" type="date" value="${item.next||''}"></div><div class="price-notice">ⓘ Preços de referência. Confirme o valor cobrado no seu plano.</div><button class="btn btn-primary">Salvar assinatura</button></form>`);
 const serviceSelect=$('#subscriptionService'),planSelect=$('#subscriptionPlan'),planField=$('#subscriptionPlanField'),customName=$('#customSubscriptionName'),valueInput=$('#subscriptionValue'),periodSelect=$('#subscriptionPeriod');
 const updatePlans=(preserve=false)=>{const service=catalogService(serviceSelect.value),custom=service.id==='custom';planField.classList.toggle('hidden',custom);customName.classList.toggle('hidden',!custom);customName.querySelector('input').required=custom;if(custom){if(!preserve)valueInput.value='';return}planSelect.innerHTML=service.plans.map(plan=>`<option value="${plan.id}" ${plan.id===item.planId?'selected':''}>${plan.name} · ${money(plan.value)}${plan.period==='Anual'?'/ano':'/mês'}</option>`).join('');if(!preserve||item.value==null)applyPlan()};
 const applyPlan=()=>{const service=catalogService(serviceSelect.value),plan=service.plans.find(p=>p.id===planSelect.value)||service.plans[0];if(plan){valueInput.value=plan.value.toFixed(2);periodSelect.value=plan.period}};
 serviceSelect.onchange=()=>updatePlans(false);planSelect.onchange=applyPlan;updatePlans(true);
 $('#subForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),service=catalogService(d.serviceId),plan=service.plans.find(p=>p.id===d.planId);d.name=service.id==='custom'?String(d.name||'').trim():service.name;d.planName=plan?.name||'';d.mark=service.mark;d.color=service.color;d.value=Number(d.value);d.id=item.id||crypto.randomUUID();d.active=item.id?item.active:true;if(item.id)state.subscriptions=state.subscriptions.map(x=>x.id===item.id?d:x);else state.subscriptions.unshift(d);save();closeDrawer();toast(item.id?'Assinatura atualizada':'Assinatura adicionada')}
}

function renderDetailViews(total,subs){
 $('#expensesViewTotal').textContent=money(total);$('#expensesPendingCount').textContent=state.expenses.filter(e=>e.status!=='paid').length;$('#expensesPaidCount').textContent=state.expenses.filter(e=>e.status==='paid').length;
 const expenses=$('#allExpensesList');expenses.innerHTML=state.expenses.length?`<div class="data-list-head"><span>Despesa</span><span>Valor</span><span>Vencimento</span><span>Status</span><span>Ações</span></div>${state.expenses.map(e=>`<div class="data-list-row"><div><strong>${escapeHtml(e.name)}</strong><small>${e.type==='recurring'?'Recorrente':'Única'}</small></div><strong>${money(e.value)}</strong><span>${shortDate(e.due)}</span><span class="status-pill ${e.status==='paid'?'paid':''}">${e.status==='paid'?'Pago':'Pendente'}</span><div class="table-actions"><button type="button" title="${e.status==='paid'?'Marcar como pendente':'Marcar como paga'}" data-pay="${e.id}">✓</button><button type="button" title="Editar" data-edit="${e.id}">✎</button><button type="button" title="Duplicar" data-copy="${e.id}">⧉</button><button type="button" title="Excluir" data-delete="${e.id}">×</button></div></div>`).join('')}`:`<div class="view-empty"><div class="empty-icon">↗</div><h3>Nenhuma despesa cadastrada</h3><p>Use “Nova despesa” para criar seu primeiro registro.</p></div>`;
 $('#subscriptionsViewTotal').textContent=money(subs);$('#subscriptionsActiveCount').textContent=state.subscriptions.filter(s=>s.active).length;$('#subscriptionsInactiveCount').textContent=state.subscriptions.filter(s=>!s.active).length;
 const subscriptions=$('#allSubscriptionsList');subscriptions.innerHTML=state.subscriptions.length?`<div class="data-list-head"><span>Assinatura</span><span>Valor</span><span>Próxima cobrança</span><span>Status</span><span>Ações</span></div>${state.subscriptions.map(s=>{const service=s.serviceId?catalogService(s.serviceId):guessService(s.name),mark=s.mark||service.mark,color=s.color||service.color;return `<div class="data-list-row"><div class="subscription-identity"><span class="service-mark" style="--service-color:${safeColor(color)}">${escapeHtml(mark)}</span><span><strong>${escapeHtml(s.name)}</strong><small>${s.planName?`${escapeHtml(s.planName)} · `:''}${escapeHtml(s.period)}</small></span></div><strong>${money(s.value)}</strong><span>${shortDate(s.next)}</span><span class="status-pill ${s.active?'active':'inactive'}">${s.active?'Ativa':'Inativa'}</span><div class="table-actions"><button type="button" title="Ativar ou desativar" data-toggle-sub="${s.id}">${s.active?'Ⅱ':'▶'}</button><button type="button" title="Editar" data-edit-sub="${s.id}">✎</button><button type="button" title="Excluir" data-delete-sub="${s.id}">×</button></div></div>`}).join('')}`:`<div class="view-empty"><div class="empty-icon">◌</div><h3>Nenhuma assinatura cadastrada</h3><p>Use “Nova assinatura” para começar a acompanhar cobranças.</p></div>`;
 $$('[data-toggle-sub]').forEach(b=>b.onclick=()=>{const s=state.subscriptions.find(x=>x.id===b.dataset.toggleSub);if(!s)return;s.active=!s.active;save();toast(s.active?'Assinatura ativada':'Assinatura pausada')});$$('[data-edit-sub]').forEach(b=>b.onclick=()=>{const s=state.subscriptions.find(x=>x.id===b.dataset.editSub);if(s)openSubscription(s)});$$('[data-delete-sub]').forEach(b=>b.onclick=()=>{const s=state.subscriptions.find(x=>x.id===b.dataset.deleteSub);if(!s||!confirm(`Excluir a assinatura “${s.name}”?`))return;state.subscriptions=state.subscriptions.filter(x=>x.id!==s.id);save();toast('Assinatura excluída')});
}

function renderFinanceChart(expenses,subscriptions,balance){
 const income=Number(state.income)||0,outflow=expenses+subscriptions,available=Math.max(balance,0),scale=Math.max(income,outflow,1),hasData=income>0||outflow>0,chartData=$('#chartData');
 $('#chartEmpty').classList.toggle('hidden',hasData);chartData.classList.toggle('hidden',!hasData);
 if(!hasData){chartData.classList.remove('chart-animate');return}
 const allocation=[['expenses',expenses],['subscriptions',subscriptions],['balance',available]];let offset=0;
 $('.budget-donut').setAttribute('aria-label',`Distribuição mensal: despesas ${money(expenses)}, assinaturas ${money(subscriptions)} e ${balance<0?'déficit':'saldo'} ${money(Math.abs(balance))}`);
 allocation.forEach(([key,value])=>{const segment=$(`#segment${key[0].toUpperCase()}${key.slice(1)}`),size=Math.max(0,value/scale*100),dash=`${size} ${100-size}`;segment.setAttribute('stroke-dasharray',dash);segment.setAttribute('stroke-dashoffset',String(-offset));segment.setAttribute('aria-label',`${key==='expenses'?'Despesas':key==='subscriptions'?'Assinaturas':'Saldo disponível'}: ${money(value)}`);if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&segment.animate)segment.animate([{strokeDasharray:'0 100'},{strokeDasharray:dash}],{duration:760,delay:offset*2,easing:'cubic-bezier(.2,.8,.2,1)'});offset+=size});
 const series={
  income:{label:'Renda mensal',short:'Renda',value:income,color:'#63a8ff',hint:'Base disponível no mês'},
  expenses:{label:'Despesas',short:'Despesas',value:expenses,color:'#ef7d78',hint:income?`${Math.round(expenses/income*100)}% da renda`:'Saídas cadastradas'},
  subscriptions:{label:'Assinaturas',short:'Assinaturas',value:subscriptions,color:'#8a7dff',hint:income?`${Math.round(subscriptions/income*100)}% da renda`:'Recorrências mensais'},
  balance:{label:balance<0?'Déficit':'Saldo disponível',short:balance<0?'Déficit':'Saldo',value:balance,color:balance<0?'#ef6666':'#45e0a8',hint:balance<0?'Acima da renda':income?`${Math.round(available/income*100)}% ainda disponível`:'Saldo do período'}
 };
 const maxBar=Math.max(...Object.values(series).map(item=>Math.abs(item.value)),1);
 $('#legend').innerHTML=Object.entries(series).map(([key,item],index)=>`<button type="button" class="finance-series" data-chart-series="${key}" aria-pressed="${chartSelection===key}" style="--item-index:${index};--bar-size:${Math.abs(item.value)/maxBar*100}%;--bar-color:${item.color}"><span class="legend-dot" style="background:${item.color}"></span><span><strong>${item.label}</strong><small>${money(item.value)}</small></span><span class="legend-bar"><i></i></span></button>`).join('');
 const selectSeries=key=>{const item=series[key]||series.income;chartData.dataset.focus=key==='balance'&&balance<0?'deficit':key;$('#chartCenterLabel').textContent=item.short;$('#chartCenter').textContent=money(item.value);$('#chartCenterHint').textContent=item.hint;$$('[data-chart-series]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chartSeries===key)));$$('[data-chart-segment]').forEach(segment=>segment.classList.toggle('is-active',balance>=0&&segment.dataset.chartSegment===key))};
 if(!series[chartSelection])chartSelection='income';selectSeries(chartSelection);
 $$('[data-chart-series]').forEach(button=>{button.onclick=()=>{chartSelection=button.dataset.chartSeries;selectSeries(chartSelection)};button.onmouseenter=()=>selectSeries(button.dataset.chartSeries);button.onmouseleave=()=>selectSeries(chartSelection);button.onfocus=()=>selectSeries(button.dataset.chartSeries)});
 $$('[data-chart-segment]').forEach(segment=>{segment.onclick=()=>{chartSelection=segment.dataset.chartSegment;selectSeries(chartSelection)};segment.onmouseenter=()=>selectSeries(segment.dataset.chartSegment);segment.onmouseleave=()=>selectSeries(chartSelection);segment.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();segment.click()}}});
 chartData.classList.remove('chart-animate');void chartData.offsetWidth;chartData.classList.add('chart-animate');
}

function render(){const total=state.expenses.reduce((a,e)=>a+Number(e.value),0),subs=state.subscriptions.filter(s=>s.active).reduce((a,s)=>a+Number(s.value)/(s.period==='Anual'?12:1),0),balance=state.income-total-subs;$('#displayName').textContent=state.name||'vamos começar';$('#incomeValue').textContent=state.income?money(state.income):'—';$('#incomeHint').textContent=state.income?`Recebimento no dia ${state.payday}`:'Informe sua renda para começar';$('#expenseTotal').textContent=money(total);$('#expenseHint').textContent=state.expenses.length?`${state.expenses.length} registro${state.expenses.length>1?'s':''} no período`:'Nenhuma despesa cadastrada';$('#subscriptionTotal').textContent=money(subs);$('#subscriptionHint').textContent=state.subscriptions.length?`${state.subscriptions.length} assinatura${state.subscriptions.length>1?'s':''}`:'Nenhuma assinatura cadastrada';$('#balanceValue').textContent=state.income?money(balance):'—';renderDetailViews(total,subs);
 const list=$('#expenseList');if(!state.expenses.length)list.innerHTML=`<div class="empty-icon">↗</div><h4>Você ainda não cadastrou nenhuma despesa</h4><p>Adicione um gasto para começar a acompanhar seu mês.</p>`,list.className='empty';else{list.className='';list.innerHTML=state.expenses.map((e,index)=>`<div class="expense-row ${e.status==='paid'?'paid':''}" style="--row-index:${index}"><div><strong>${escapeHtml(e.name)}</strong><small>${e.status==='paid'?'Pago':'Pendente'} · ${e.type==='recurring'?'Recorrente':'Única'}</small></div><div class="amount"><strong>${money(e.value)}</strong><small>${shortDate(e.due)}</small></div><div class="row-actions"><button type="button" title="${e.status==='paid'?'Marcar como pendente':'Marcar como paga'}" data-pay="${e.id}">✓</button><button type="button" title="Editar" data-edit="${e.id}">✎</button><button type="button" title="Duplicar" data-copy="${e.id}">⧉</button><button type="button" title="Excluir" data-delete="${e.id}">×</button></div></div>`).join('')}
 renderFinanceChart(total,subs,balance);$$('button[title]:not([aria-label])').forEach(button=>button.setAttribute('aria-label',button.title));
 $$('[data-pay]').forEach(b=>b.onclick=async()=>{const e=state.expenses.find(x=>x.id===b.dataset.pay);if(!e||b.disabled)return;b.disabled=true;try{await updateExpense(e.id,{...e,status:e.status==='paid'?'pending':'paid'});await loadExpenses();toast('Status atualizado no banco')}catch(error){console.error(error);toast('Erro ao atualizar o status');b.disabled=false}});$$('[data-edit]').forEach(b=>b.onclick=()=>openExpense(state.expenses.find(x=>x.id===b.dataset.edit)));$$('[data-copy]').forEach(b=>b.onclick=async()=>{const e=state.expenses.find(x=>x.id===b.dataset.copy);if(!e||b.disabled)return;b.disabled=true;try{await createExpense({...e,name:`${e.name} (cópia)`});await loadExpenses();toast('Despesa duplicada no banco')}catch(error){console.error(error);toast('Erro ao duplicar a despesa');b.disabled=false}});$$('[data-delete]').forEach(b=>b.onclick=async()=>{const expense=state.expenses.find(x=>x.id===b.dataset.delete);if(!expense||b.disabled||!confirm(`Excluir a despesa “${expense.name}”?`))return;b.disabled=true;try{await deleteExpense(expense.id);await loadExpenses();toast('Despesa excluída do banco')}catch(error){console.error(error);toast('Erro ao excluir a despesa');b.disabled=false}})}

function showView(name){if(name==='settings'){openProfile();return}$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.dash-view').forEach(v=>v.classList.remove('active'));$(`#${name}View`).classList.add('active')}
$$('[data-income]').forEach(b=>b.onclick=openIncome);$$('[data-edit-profile]').forEach(b=>b.onclick=openProfile);$$('[data-expense]').forEach(b=>b.onclick=()=>openExpense());$$('[data-subscription]').forEach(b=>b.onclick=()=>openSubscription());$$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));render();loadExpenses();
