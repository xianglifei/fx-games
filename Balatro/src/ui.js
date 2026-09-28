/* ============================================================
   UI 层:渲染 / 动画 / 输入(原创视觉实现)
   ============================================================ */
'use strict';
const $=id=>document.getElementById(id);
const SAVE_KEY='jokersdeck.save.v1',META_KEY='jokersdeck.meta.v1';
const UI={G:null,animating:false,selMode:null,sortMode:'rank',deckPick:'red',blindAction:'play'};
let META={bestAnte:1,wins:0,runs:0,sound:false,handsPlayed:0};

function loadMeta(){try{const m=JSON.parse(localStorage.getItem(META_KEY));if(m)META={...META,...m}}catch(e){}}
function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(META))}catch(e){}}
function saveRun(){if(!UI.G)return;try{localStorage.setItem(SAVE_KEY,Engine.serialize(UI.G))}catch(e){}}
function clearRun(){try{localStorage.removeItem(SAVE_KEY)}catch(e){}}
function loadRun(){try{const s=localStorage.getItem(SAVE_KEY);return s?Engine.deserialize(s):null}catch(e){return null}}
function hasSave(){return !!localStorage.getItem(SAVE_KEY)}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RARITY_NAME={1:'常见',2:'罕见',3:'稀有',4:'传说'};
const RARITY_CLS={1:'r-common',2:'r-uncommon',3:'r-rare',4:'r-legend'};

/* ---------- 屏幕管理 ---------- */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on','pop-in'));
  const el=$(id);el.classList.add('on');
  void el.offsetWidth;el.classList.add('pop-in');
}
function toast(msg){
  const t=$('toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('on'),1600);
}
function confirmPop(title,desc,btns){
  $('cb-title').textContent=title;$('cb-desc').textContent=desc;
  const bb=$('cb-btns');bb.innerHTML='';
  btns.forEach(b=>{const el=document.createElement('button');el.className='bigbtn '+(b.cls||'dark');el.textContent=b.txt;el.onclick=()=>{$('confirmPop').classList.remove('on');b.cb&&b.cb()};bb.appendChild(el)});
  $('confirmPop').classList.add('on');
}
function floaty(x,y,txt,cls){
  const el=document.createElement('div');
  el.className='floaty '+(cls||'');el.textContent=txt;
  el.style.left=x+'px';el.style.top=y+'px';
  $('fxLayer').appendChild(el);
  setTimeout(()=>el.remove(),950);
}
function floatyAt(el,txt,cls){
  if(!el)return;
  const r=el.getBoundingClientRect();
  floaty(r.left+r.width/2-20,r.top-8,txt,cls);
}
function confetti(n=60){
  const box=$('confetti');
  const emojis=['🃏','🎉','💰','⭐','🪙','♦️','♥️','♠️','♣️'];
  for(let i=0;i<n;i++){
    const e=document.createElement('div');
    e.className='confetto';e.textContent=emojis[i%emojis.length];
    e.style.left=Math.random()*100+'%';
    e.style.animationDuration=(1.6+Math.random()*1.8)+'s';
    e.style.animationDelay=(Math.random()*.5)+'s';
    e.style.fontSize=(14+Math.random()*16)+'px';
    box.appendChild(e);
    setTimeout(()=>e.remove(),3800);
  }
}

/* ---------- 长按/悬停信息 ---------- */
function attachInfo(el,build){
  let tm=null;
  const show=()=>{
    const pop=$('infoPop');pop.innerHTML=build();pop.style.display='block';
    const r=el.getBoundingClientRect();
    const pw=Math.min(300,innerWidth*.84);
    let x=r.right+8;if(x+pw>innerWidth-8)x=r.left-pw-8;
    if(x<8)x=8;
    let y=Math.min(r.top,innerHeight-190);
    pop.style.left=x+'px';pop.style.top=y+'px';
  };
  const hide=()=>{$('infoPop').style.display='none'};
  el.addEventListener('mouseenter',show);
  el.addEventListener('mouseleave',hide);
  el.addEventListener('touchstart',e=>{tm=setTimeout(show,420)},{passive:true});
  el.addEventListener('touchend',()=>{clearTimeout(tm);hide()},{passive:true});
  el.addEventListener('touchmove',()=>{clearTimeout(tm)},{passive:true});
  el.addEventListener('contextmenu',e=>e.preventDefault());
}

/* ---------- 扑克牌 DOM ---------- */
function pcardEl(c,small){
  const el=document.createElement('div');
  el.className='pcard'+(c.suit===1||c.suit===2?' red':'');
  el.dataset.uid=c.uid;
  if(c.enh==='stone')el.classList.add('stone');
  else{
    if(c.enh==='glass')el.classList.add('glass');
    if(c.enh==='steel')el.classList.add('steel');
    if(c.enh==='gold')el.classList.add('gold');
    if(c.enh==='lucky')el.classList.add('lucky');
    if(c.enh==='wild')el.classList.add('wild');
    if(c.enh==='bonus')el.classList.add('bonus');
    if(c.enh==='mult')el.classList.add('multy');
  }
  const rs=Engine.makeCard?RANK_NAME(c.rank):c.rank;
  const cornerHtml=`<div class="corner">${rs}<span class="s">${SUITS[c.suit]}</span></div><div class="corner br">${rs}<span class="s">${SUITS[c.suit]}</span></div>`;
  let pipHtml;
  if(c.enh==='stone')pipHtml='';
  else if(c.rank>10&&c.rank<14){
    pipHtml=`<div class="pip"><span class="face-crown">${c.rank===11?'🗡️':'👑'}</span><span class="face-letter">${rs}</span></div>`;
  }else pipHtml=`<div class="pip">${SUITS[c.suit]}</div>`;
  el.innerHTML=cornerHtml+pipHtml;
  if(c.ed)el.innerHTML+=`<span class="edbadge ${c.ed}">${ED_META[c.ed].n}</span>`;
  if(c.seal)el.innerHTML+=`<span class="seal-dot ${c.seal}"></span>`;
  if(c.debuff)el.classList.add('debuff');
  if(c.facedown)el.classList.add('facedown');
  return el;
}
function cardInfoHtml(c){
  let s=`<div class="ip-name">${RANK_NAME(c.rank)}${SUITS[c.suit]}${c.enh==='stone'?'(石头)':''}</div>`;
  if(c.enh)s+=`<div class="ip-sub" style="color:var(--gold)">${ENH_META[c.enh].n}:${ENH_META[c.enh].d}</div>`;
  if(c.ed)s+=`<div class="ip-sub" style="color:var(--purple)">${ED_META[c.ed].n}:${ED_META[c.ed].d}</div>`;
  if(c.seal)s+=`<div class="ip-sub" style="color:var(--chip)">${SEAL_META[c.seal].n}:${SEAL_META[c.seal].d}</div>`;
  if(!c.enh&&!c.ed&&!c.seal)s+=`<div class="ip-desc">基础牌:${c.rank===14?11:c.rank>10?10:c.rank} 筹码</div>`;
  if(c.debuff)s+=`<div class="ip-sub" style="color:var(--mult)">⛔ 被禁用:不计分、无效果</div>`;
  return s;
}

/* ---------- 小丑/消耗牌 DOM ---------- */
function jcardEl(j){
  const d=JOKERS[j.id];
  const el=document.createElement('div');
  el.className='jcard '+RARITY_CLS[d.r];
  el.dataset.juid=j.uid;
  const bg=`background:linear-gradient(150deg,${d.g}55,#ffffff22 55%,transparent)`;
  el.innerHTML=`<div class="jc-art" style="${bg}"><span>${d.e}</span></div>
    <div class="jc-name">${d.n}</div>
    ${j.ed?`<span class="jc-ed ${j.ed}">${ED_META[j.ed].n}</span>`:''}`;
  if(j.debuff)el.classList.add('debuff');
  const cnt=[];
  if(j.c.mult)cnt.push('+'+j.c.mult+'多倍');
  if(j.c.x)cnt.push('×'+(Math.round(j.c.x*10)/10));
  if(j.c.chips)cnt.push('+'+j.c.chips+'筹码');
  if(j.c.pay)cnt.push('$'+j.c.pay);
  if(j.c.hs!==undefined&&d.n==='龟龟')cnt.push('+'+j.c.hs+'手牌');
  if(cnt.length){const b=document.createElement('span');b.className='jc-count';b.textContent=cnt[0];el.appendChild(b)}
  if(j.sellBonus){const b=document.createElement('span');b.className='jc-count';b.style.left='4px';b.style.right='auto';b.textContent='+$'+j.sellBonus;el.appendChild(b)}
  el._joker=j;
  return el;
}
function jokerInfoHtml(j){
  const d=JOKERS[j.id];
  let s=`<div class="ip-name">${d.e} ${d.n}</div><div class="ip-sub" style="color:var(--r-${{1:'common',2:'uncommon',3:'rare',4:'legend'}[d.r]})">${RARITY_NAME[d.r]}小丑${j.ed?' · '+ED_META[j.ed].n+'('+ED_META[j.ed].d+')':''}</div>`;
  s+=`<div class="ip-desc">${d.d}</div>`;
  if(j.c.mult)s+=`<div class="ip-sub">当前:+${j.c.mult} 多倍</div>`;
  if(j.c.x)s+=`<div class="ip-sub">当前:×${Math.round(j.c.x*100)/100} 多倍</div>`;
  if(j.c.chips)s+=`<div class="ip-sub">当前:+${j.c.chips} 筹码</div>`;
  if(j.c.pay)s+=`<div class="ip-sub">当前:回合结束 +$${j.c.pay}</div>`;
  if(j.c.hs!==undefined&&d.n==='龟龟')s+=`<div class="ip-sub">当前:+${j.c.hs} 手牌上限</div>`;
  s+=`<div class="ip-sub">售价 $${Engine.sellValueOf(j)}</div>`;
  return s;
}
function consumableEl(cs){
  let d,cls,glyph;
  if(cs.kind==='tarot'){d=TAROTS[cs.id];cls='t-tarot';glyph='🔮'}
  else if(cs.kind==='planet'){d=PLANETS[cs.id];cls='t-planet';glyph='🪐'}
  else{d=SPECTRALS[cs.id];cls='t-spectral';glyph='👁️'}
  const el=document.createElement('div');
  el.className='jcard '+cls;
  el.innerHTML=`<div class="jc-art"><span class="t-glyph">${d.e}</span></div><div class="jc-name">${d.n}</div>`;
  el._cons=cs;
  return el;
}
function consumableInfoHtml(cs){
  const kindName={tarot:'塔罗牌',planet:'星球牌',spectral:'光谱牌'}[cs.kind];
  const d=cs.kind==='tarot'?TAROTS[cs.id]:cs.kind==='planet'?PLANETS[cs.id]:SPECTRALS[cs.id];
  const selTxt=d.sel?`<div class="ip-sub">使用时需选 ${d.sel} 张手牌</div>`:'';
  return `<div class="ip-name">${d.e} ${d.n}</div><div class="ip-sub" style="color:var(--purple)">${kindName}</div><div class="ip-desc">${d.d}</div>${selTxt}`;
}
function voucherEl(v){
  const d=VOUCHERS[v];
  const el=document.createElement('div');
  el.className='jcard t-voucher';
  el.innerHTML=`<div class="jc-art"><span class="t-glyph">${d.e}</span></div><div class="jc-name">${d.n}</div>`;
  return el;
}
function voucherInfoHtml(v){
  const d=VOUCHERS[v];
  return `<div class="ip-name">${d.e} ${d.n}</div><div class="ip-sub" style="color:var(--gold)">代金券</div><div class="ip-desc">${d.d}</div>`;
}

/* ---------- 左栏渲染 ---------- */
function currentBlindInfo(G){
  if(G.blind==='small')return{n:'小盲注',e:'💵',mult:'1x',reward:3,cls:'small'};
  if(G.blind==='big')return{n:'大盲注',e:'💰',mult:'1.5x',reward:4,cls:'big'};
  const b=BOSSES[G.bossId];
  return{n:b.n,e:b.e,mult:b.mult+'x',reward:b.showdown?8:5,cls:'boss'};
}
function renderAnteTrack(){
  const box=$('ante-track');box.innerHTML='';
  const G=UI.G;
  if(G.ante>8){
    const s=document.createElement('span');s.className='px';s.style.color='var(--gold)';
    s.textContent='ENDLESS · ANTE '+G.ante;box.appendChild(s);return;
  }
  for(let i=1;i<=8;i++){
    const d=document.createElement('div');
    d.className='ante-dot'+(i<G.ante?' done':i===G.ante?' cur':'');
    d.textContent=i;
    if(i===G.ante&&G.blind==='boss'){d.classList.add('bossdot');d.textContent=BOSSES[G.bossId].e}
    box.appendChild(d);
    if(i===4){const sep=document.createElement('span');sep.className='ante-sep';sep.textContent='·';box.appendChild(sep)}
  }
}
function renderRail(){
  const G=UI.G;
  renderAnteTrack();
  const bi=currentBlindInfo(G);
  const bc=$('card-blind');
  bc.className='panelcard blind '+bi.cls;
  $('bc-name').textContent=G.blind==='boss'?('Boss · '+bi.n):bi.n;
  $('bc-mult').textContent=bi.mult;
  $('bc-art').textContent=bi.e;
  $('bc-reward').textContent='$'+bi.reward;
  $('sc-target').textContent=Engine.fmt(G.target||0);
  $('sc-score').textContent=Engine.fmt(G.score||0);
  /* 手牌类型预览 */
  const st=Engine.recalcStats(G);
  const selCards=G.selected.map(uid=>G.hand.find(c=>c.uid===uid)).filter(Boolean);
  let ev=null;
  if(selCards.length)ev=Engine.evaluateHand(G,selCards);
  const h=ev?HANDS[ev.type]:HANDS.hc;
  const base=Engine.handBase(G,ev?ev.type:'hc');
  $('hh-name').textContent=h.n;
  $('hh-lv').textContent='lv.'+(ev?G.handLevels[ev.type]:G.handLevels.hc);
  $('hh-chips').textContent=base.chips;
  $('hh-mult').textContent=base.mult;
  $('hh-plays').textContent=G.plays;
  $('hh-plays').parentElement.classList.toggle('warn',G.plays<=1);
  $('hh-discards').textContent=G.discardsLeft;
  $('hh-handsize').textContent=st.handSize+(G.tempHandSize||0);
  /* 钱/ante/round */
  $('money-val').textContent='$'+G.money;
  $('ante-val').textContent=G.ante>8?'∞':G.ante+'/8';
  $('round-val').textContent=G.round;
  /* 牌堆 */
  $('dk-count').textContent=G.pile.length+'/'+G.deck.length;
  /* 消息行 */
  const ml=$('msgline');
  if(UI.selMode){
    const d=UI.selMode.kind==='consumable'?consDef(UI.selMode.idx):null;
    ml.innerHTML=`<span style="color:var(--purple)">为「${d?d.n:''}」选择 ${UI.selMode.need} 张手牌${UI.selMode.target?'':'(点满自动使用)'} </span>`;
  }else if(selCards.length&&ev){
    ml.innerHTML=`${h.n} · lv.${G.handLevels[ev.type]} <span class="prev-chip px">${base.chips}</span> × <span class="prev-mult px">${base.mult}</span>`;
  }else{
    ml.textContent=G.phase==='play'?'选择手牌,出牌或弃牌':'';
  }
  /* 按钮 */
  const canPlay=G.phase==='play'&&!UI.animating;
  $('btn-play').disabled=!canPlay||!selCards.length;
  $('btn-discard').disabled=!canPlay||!G.discardsLeft||!selCards.length||UI.selMode;
  $('btn-play').classList.toggle('ready',canPlay&&selCards.length>0);
  $('sel-count').textContent=selCards.length?`已选 ${selCards.length}/5`:'未选牌';
}
function consDef(idx){
  const cs=UI.G.consumables[idx];if(!cs)return null;
  return cs.kind==='tarot'?TAROTS[cs.id]:cs.kind==='planet'?PLANETS[cs.id]:SPECTRALS[cs.id];
}

/* ---------- 托盘 ---------- */
function renderTrays(){
  const G=UI.G;
  const jt=$('joker-tray'),ct=$('consumable-tray');
  jt.innerHTML='<div class="tray-label">小丑</div>';
  ct.innerHTML='<div class="tray-label">消耗牌</div>';
  const st=Engine.recalcStats(G);
  for(const j of G.jokers){
    const el=jcardEl(j);
    attachInfo(el,()=>jokerInfoHtml(j));
    el.onclick=()=>onJokerClick(j,el);
    jt.appendChild(el);
  }
  for(let i=G.jokers.length;i<st.jokerSlots;i++){
    const e=document.createElement('div');e.className='empty-slot';e.textContent='+';jt.appendChild(e);
  }
  for(const cs of G.consumables){
    const el=consumableEl(cs);
    attachInfo(el,()=>consumableInfoHtml(cs));
    el.onclick=()=>onConsumableClick(cs,el);
    ct.appendChild(el);
  }
  for(let i=G.consumables.length;i<st.consumableSlots;i++){
    const e=document.createElement('div');e.className='empty-slot';e.textContent='+';ct.appendChild(e);
  }
}
function onJokerClick(j,el){
  Snd.click();
  if(UI.animating)return;
  const G=UI.G;
  /* 消耗牌目标选择(命运之轮) */
  if(UI.selMode&&UI.selMode.target){UI.selMode.targetJoker=j;finishConsumableSel();return}
  if(G.phase==='shop'){
    const acts=[
      {txt:'卖出 $'+Engine.sellValueOf(j),cls:'gold',cb:()=>{
        const r=Engine.sellJoker(G,G.jokers.indexOf(j));
        if(r.ok){Snd.money();toast('卖出 +$'+r.v);refreshAll();saveRun()}
        else{Snd.error();toast(r.error)}
      }},
    ];
    const i=G.jokers.indexOf(j);
    if(i>0)acts.push({txt:'⬅ 左移',cb:()=>{Engine.reorderJoker(G,i,i-1);refreshAll();saveRun()}});
    if(i<G.jokers.length-1)acts.push({txt:'右移 ➡',cb:()=>{Engine.reorderJoker(G,i,i+1);refreshAll();saveRun()}});
    acts.push({txt:'关闭',cls:'dark'});
    confirmPop(JOKERS[j.id].n,JOKERS[j.id].d+'<br>售价 $'+Engine.sellValueOf(j),acts);
  }
}
function onConsumableClick(cs,el){
  if(UI.animating)return;
  Snd.click();
  const G=UI.G;
  if(UI.selMode){cancelSelMode();return}
  if(G.phase==='shop'||G.phase==='select'||G.phase==='play'){
    if(G.phase==='shop'){confirmPop('使用'+consDef(G.consumables.indexOf(cs)).n,consDef(G.consumables.indexOf(cs)).d,[
      {txt:'使用',cls:'gold',cb:()=>beginUseConsumable(cs)},
      {txt:'卖出',cls:'red',cb:()=>{const i=G.consumables.indexOf(cs);Engine.sellConsumable(G,i);Snd.money();toast('已卖出');refreshAll();saveRun()}},
      {txt:'关闭',cls:'dark'}]);
      return;
    }
    beginUseConsumable(cs);
  }
}
function beginUseConsumable(cs){
  const G=UI.G;
  const idx=G.consumables.indexOf(cs);
  const def=consDef(idx);
  if(idx<0)return;
  if(cs.kind==='planet'){
    const r=Engine.useConsumable(G,idx);
    if(r.ok){Snd.pack();toast('「'+HANDS[PLANETS[cs.id].hand].n+'」升级!');refreshAll();saveRun()}
    else{Snd.error();toast(r.error)}
    return;
  }
  const need=def.sel||0;
  if(need>0){
    if(G.phase!=='play'&&G.phase!=='select'){Snd.error();toast('打牌时才能选牌使用');return}
    if(G.hand.length<need){Snd.error();toast('手牌不够');return}
    UI.selMode={kind:'consumable',idx,need,target:!!def.target,sel:[]};
    G.selected=[];
    renderRail();renderHand();
    $('sel-banner').classList.add('on');
    $('sel-banner-txt').textContent=def.n+':'+def.d;
  }else if(def.target==='joker'){
    if(!G.jokers.length){Snd.error();toast('没有小丑可选');return}
    UI.selMode={kind:'consumable',idx,need:0,target:true,sel:[]};
    G.selected=[];
    $('sel-banner').classList.add('on');
    $('sel-banner-txt').textContent=def.n+':'+def.d+'(点击一张小丑)';
    renderRail();
  }else{
    const r=Engine.useConsumable(G,idx);
    handleUseResult(cs,r);
  }
}
function finishConsumableSel(){
  const G=UI.G,sm=UI.selMode;
  const r=Engine.useConsumable(G,sm.idx,G.smCards,sm.targetJoker);
  endSelMode();
  handleUseResult(null,r);
}
function handleUseResult(cs,r){
  const G=UI.G;
  if(r.error){Snd.error();toast(r.error);refreshAll();return}
  if(r.refund){Snd.error();toast('运气不佳,没有效果(已退还)');refreshAll();saveRun();return}
  if(r.ok){
    Snd.pack();
    replayEventsBrief(r.ev);
    refreshAll();saveRun();
  }
}
function cancelSelMode(){endSelMode();refreshAll()}
function endSelMode(){
  UI.selMode=null;
  if(UI.G)UI.G.selected=[];
  $('sel-banner').classList.remove('on');
}

/* ---------- 手牌 ---------- */
function sortedHand(G){
  const h=[...G.hand];
  if(UI.sortMode==='suit')h.sort((a,b)=>suitGroup(G,a.suit)-suitGroup(G,b.suit)||b.rank-a.rank);
  else h.sort((a,b)=>(a.enh==='stone')-(b.enh==='stone')||b.rank-a.rank||a.suit-b.suit);
  return h;
}
function renderHand(){
  const G=UI.G,box=$('hand-cards');
  box.innerHTML='';
  if(G.phase!=='play'&&G.phase!=='select')return;
  for(const c of sortedHand(G)){
    const el=pcardEl(c);
    if(G.selected.includes(c.uid))el.classList.add('sel');
    el.onclick=()=>toggleSelect(c);
    attachInfo(el,()=>cardInfoHtml(c));
    box.appendChild(el);
  }
}
function toggleSelect(c){
  const G=UI.G;
  if(UI.animating||G.phase!=='play'&&!UI.selMode)return;
  if(UI.selMode){
    if(UI.selMode.target)return;
    const i=G.selected.indexOf(c.uid);
    if(i>=0){G.selected.splice(i,1);Snd.deselect()}
    else{
      if(G.selected.length>=UI.selMode.need)G.selected.shift();
      G.selected.push(c.uid);Snd.select();
      if(G.selected.length===UI.selMode.need){
        G.smCards=G.selected.map(uid=>G.hand.find(x=>x.uid===uid));
        UI._selTimer&&clearTimeout(UI._selTimer);
        UI._selTimer=setTimeout(()=>{if(UI.selMode&&UI.G.selected.length===UI.selMode.need){UI.smCards2=G.smCards;finishConsumableSel()}},260);
      }
    }
    renderHand();renderRail();
    return;
  }
  const i=G.selected.indexOf(c.uid);
  if(i>=0){G.selected.splice(i,1);Snd.deselect()}
  else{
    if(G.selected.length>=5){Snd.error();return}
    G.selected.push(c.uid);Snd.select();
  }
  renderHand();renderRail();
}
$('sel-banner-cancel').onclick=()=>cancelSelMode();

/* ---------- 盲注选择屏 ---------- */
function tagPreviewHtml(tagId,dup){
  const t=TAGS[tagId];
  return `跳过 → <b>${t.e} ${t.n}</b>${dup?' ×2':''}<br><span style="font-size:10px;color:var(--dim2)">${t.d}</span>`;
}
function renderBlindSelect(){
  const G=UI.G;
  endSelMode();
  showScreen('scr-blind');
  const wrap=$('blind-cards');wrap.innerHTML='';
  const peek=Engine.peekTag(G);
  const blinds=[
    {id:'small',cls:'small',name:'小盲注',art:'💵',reward:3,mult:'基础分 ×1',
     desc:'每个 Ante 的第一关,热身用。'},
    {id:'big',cls:'big',name:'大盲注',art:'💰',reward:4,mult:'基础分 ×1.5',
     desc:'第二关,分数要求高一些。',cur:G.blind==='big'},
    {id:'boss',cls:'boss',name:'Boss · '+BOSSES[G.bossId].n,art:BOSSES[G.bossId].e,reward:BOSSES[G.bossId].showdown?8:5,mult:'基础分 ×'+BOSSES[G.bossId].mult,
     desc:BOSSES[G.bossId].d,cur:G.blind==='boss'},
  ];
  for(const b of blinds){
    const cur=(b.id===G.blind);
    const el=document.createElement('div');
    el.className='bcard '+b.cls+(cur?' sel':'');
    el.innerHTML=`
      <div class="bh"><span>${cur?'当前盲注':''}</span><span class="px">${b.mult}</span></div>
      <div class="bname">${b.name}</div>
      <div class="bart">${b.art}</div>
      <div class="bdesc">${b.desc}</div>
      <div class="breward"><span>奖金</span><b class="px">$${b.reward}</b></div>
      <div class="skipline">${b.id===G.blind&&b.id!=='boss'?tagPreviewHtml(peek,G.nextTagDupe>0):b.id==='boss'?'Boss 盲注不能跳过':''}</div>`;
    el.onclick=()=>{
      Snd.select();
      document.querySelectorAll('.bcard').forEach(x=>x.classList.remove('picked'));
      el.classList.add('picked');
      UI.blindAction=b.id;
    };
    wrap.appendChild(el);
  }
  UI.blindAction=G.blind;
  $('blind-go').textContent='出战'+currentBlindInfo(G).n;
}
function onBlindGo(){
  const G=UI.G;
  Snd.unlock();
  if(UI.blindAction==='boss'&&G.blind!=='boss'){}
  if(UI.blindAction===G.blind){
    const r=Engine.startBlind(G,G.blind);
    if(r.error){Snd.error();toast(r.error);return}
    Snd.boss&&G.blind==='boss'?Snd.boss():Snd.deal();
    startRoundUI();
  }else{
    /* 跳过当前盲注拿标签 */
    const r=Engine.skipBlind(G);
    if(r.error){Snd.error();toast(r.error);return}
    Snd.money();
    toast('跳过!获得 '+TAGS[r.tag].n+(r.dup?' ×2':''));
    saveRun();
    if(r.openPack){openTagPack(r.openPack,()=>renderBlindSelect());return}
    renderBlindSelect();
  }
}
function openTagPack(typeId,after){
  UI.G.pack=Engine.openPack(UI.G,typeId);
  showPackOverlay('奖励:'+PACKS[typeId].n,after);
}

/* ---------- 回合开始 ---------- */
async function startRoundUI(){
  const G=UI.G;
  UI.animating=true;
  endSelMode();
  showScreen('scr-game');
  renderRail();renderTrays();
  $('hand-cards').innerHTML='';
  $('played-cards').innerHTML='';
  await sleep(120);
  renderHand();
  /* 发牌音效 */
  const cards=$('hand-cards').children;
  for(let i=0;i<cards.length;i++){
    setTimeout(()=>Snd.deal(),i*40);
    cards[i].style.animation='popIn .25s backwards';
    cards[i].style.animationDelay=(i*40)+'ms';
  }
  await sleep(cards.length*40+250);
  Engine.bellForceSelect(G);
  UI.animating=false;
  renderRail();renderHand();
  saveRun();
}

/* ---------- 出牌动画 ---------- */
async function doPlay(){
  const G=UI.G;
  if(UI.animating)return;
  const playedUids=[...G.selected];
  const r=Engine.playHand(G);
  if(r.error){Snd.error();toast(r.error);return}
  UI.animating=true;
  META.handsPlayed++;
  $('btn-play').disabled=true;$('btn-discard').disabled=true;
  /* 把选中的牌移动到出牌区 */
  const played=$('played-cards');played.innerHTML='';
  const selEls=[];
  const handBox=$('hand-cards');
  for(const uid of playedUids){
    const el=handBox.querySelector(`[data-uid="${uid}"]`);
    if(el){const cl=el.cloneNode(true);played.appendChild(cl);el.remove();selEls.push(cl)}
  }
  renderHand();renderRail();
  await sleep(200);
  /* 回放事件 */
  await replayScoreEvents(r.ev,played,selEls);
  /* 清场 */
  await sleep(260);
  played.innerHTML='';
  renderRail();renderTrays();renderHand();
  UI.animating=false;
  saveRun();
  if(r.won){await onRoundWon();return}
  if(r.lost){
    const lr=Engine.roundLost(G);
    if(lr.saved){toast('骨先生:分数已达标 25%,续命!');Snd.joker();G.plays=1;renderRail();saveRun();return}
    onGameOver(false);return;
  }
}
function elForUid(uid){
  return document.querySelector(`#played-cards [data-uid="${uid}"],#joker-tray [data-juid="${uid}"],#hand-cards [data-uid="${uid}"]`);
}
function elForJokerId(uid){
  return document.querySelector(`#joker-tray [data-juid="${uid}"]`);
}
async function replayScoreEvents(ev,playedBox,selEls){
  const G=UI.G;
  let scoreShown=G.score-ev.reduce((s,e)=>s+(e.t==='total'?e.gained:0),0);
  for(const e of ev){
    if(e.t==='hand'){
      UI._sc={chips:e.chips,mult:e.mult};
      $('hh-chips').textContent=Engine.fmt(e.chips);$('hh-mult').textContent=Math.round(e.mult*100)/100;
      Snd.joker();await sleep(240);
    }else if(e.t==='card'){
      const el=elForUid(e.uid);
      if(el){el.classList.remove('scored');void el.offsetWidth;el.classList.add('scored');floatyAt(el,'+'+e.chips,'chips')}
      Snd.chips(e.chips);
      bump('hh-chips');await sleep(190);
    }else if(e.t==='chips'||e.t==='mult'||e.t==='xmult'){
      let el=null;
      if(e.uid&&String(e.uid).startsWith('j'))el=elForJokerId(e.uid);
      else if(e.uid)el=elForUid(e.uid);
      const txt=e.t==='chips'?'+'+e.n+'筹码':e.t==='mult'?'+'+e.n+'多倍':'×'+e.x;
      if(el){el.classList.remove('acting');void el.offsetWidth;el.classList.add('acting');floatyAt(el,txt,e.t==='chips'?'chips':e.t==='mult'?'mult':'xmult')}
      if(e.t==='chips'){Snd.chips(e.n);bump('hh-chips')}
      else if(e.t==='mult'){Snd.mult();bump('hh-mult')}
      else{Snd.xmult();bump('hh-mult')}
      if(!UI._sc)UI._sc={chips:0,mult:1};
      if(e.t==='chips')UI._sc.chips+=e.n;
      else if(e.t==='mult')UI._sc.mult+=e.n;
      else UI._sc.mult*=e.x;
      $('hh-chips').textContent=Engine.fmt(UI._sc.chips);
      $('hh-mult').textContent=Math.round(UI._sc.mult*100)/100;
      await sleep(230);
    }else if(e.t==='money'){
      Snd.money();floaty(innerWidth/2-30,innerHeight*.4,(e.n>0?'+$':'-$')+Math.abs(e.n),'money');
      renderRailMoney();await sleep(200);
    }else if(e.t==='glassBreak'){
      const el=elForUid(e.uid);
      if(el){el.style.transition='transform .3s,opacity .3s';el.style.transform='scale(.2) rotate(30deg)';el.style.opacity='0'}
      Snd.destroy();await sleep(280);
    }else if(e.t==='total'){
      await countScore(scoreShown,e.score,e.gained);
      scoreShown=e.score;
    }else if(e.t==='debuffCard'){
      const el=elForUid(e.uid);if(el){el.classList.add('shake');Snd.error();floatyAt(el,'被禁用','mult')}
      await sleep(160);
    }else if(e.t==='bossDiscard'){
      renderRail();Snd.error();toast('铁钩弃掉你 2 张牌!');await sleep(240);
    }
  }
}
function bump(id){const el=$(id);el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')}
function renderRailMoney(){const G=UI.G;$('money-val').textContent='$'+G.money;$('money-val').classList.remove('up');void $('money-val').offsetWidth;$('money-val').classList.add('up')}
async function countScore(from,to,gained){
  const el=$('sc-score');
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
  const steps=Math.min(26,Math.max(8,Math.log10(to-from+2)*6|0));
  for(let i=1;i<=steps;i++){
    el.textContent=Engine.fmt(from+(to-from)*i/steps);
    Snd.chips(i);
    await sleep(26);
  }
  el.textContent=Engine.fmt(to);
  if(gained>=(UI.G.target||1)*.25){$('app').classList.remove('shake');void $('app').offsetWidth;$('app').classList.add('shake')}
  floaty(innerWidth/2-40,innerHeight*.3,'+'+Engine.fmt(gained),'xmult');
}

/* ---------- 弃牌 ---------- */
async function doDiscard(){
  const G=UI.G;
  if(UI.animating)return;
  const r=Engine.discardSelected(G);
  if(r.error){Snd.error();toast(r.error);return}
  UI.animating=true;
  $('btn-play').disabled=true;$('btn-discard').disabled=true;
  Snd.flip();
  /* 动画:选中牌淡出 */
  const handBox=$('hand-cards');
  for(const uid of r.ev.filter(e=>e.t==='discard').map(e=>e.uid)){
    const el=handBox.querySelector(`[data-uid="${uid}"]`);
    if(el){el.style.transition='transform .25s,opacity .25s';el.style.transform='translateY(60px) rotate(10deg)';el.style.opacity='0'}
  }
  await sleep(280);
  replayEventsBrief(r.ev);
  renderHand();renderRail();
  UI.animating=false;
  saveRun();
}
function replayEventsBrief(ev){
  if(!ev)return;
  for(const e of ev){
    if(e.t==='money')Snd.money();
    if(e.t==='levelUp')toast('「'+HANDS[e.hand].n+'」升级!');
    if(e.t==='destroy')Snd.destroy();
    if(e.t==='spawn')Snd.pack();
  }
}

/* ---------- 回合胜利结算 ---------- */
async function onRoundWon(){
  const G=UI.G;
  const rewards=Engine.cashoutRewards(G);
  Snd.blindWin();
  await sleep(300);
  /* 填充结算列表 */
  const list=$('cash-list');list.innerHTML='';
  let total=0;
  rewards.items.forEach((it,i)=>{
    total+=it.n;
    const el=document.createElement('div');
    el.className='cash-item';el.style.animationDelay=(i*.18)+'s';
    el.innerHTML=`<span>${it.lab}</span><b class="px">+$${it.n}</b>`;
    list.appendChild(el);
  });
  for(const e of rewards.ev){if(e.t==='money'){total+=e.n;
    const el=document.createElement('div');el.className='cash-item';el.style.animationDelay='.5s';
    el.innerHTML=`<span>${JOKERS[e.src]?JOKERS[e.src].n:'小丑'}</span><b class="px">+$${e.n}</b>`;list.appendChild(el)}}
  rewards.destroyed.forEach((j,i)=>{
    const el=document.createElement('div');el.className='cash-item';el.style.animationDelay='.6s';
    el.innerHTML=`<span style="color:var(--mult)">${JOKERS[j.id].n} 被吃掉了…</span><b class="px">💀</b>`;list.appendChild(el);
  });
  $('cash-total').textContent='+$'+total;
  showScreen('scr-cashout');
  $('cash-go').onclick=async()=>{
    Snd.cash();
    const r=Engine.finishCashout(G,rewards);
    if(r.won){clearRun();onGameOver(true);return}
    Engine.startShop(G);
    saveRun();
    renderShop();
  };
}

/* ---------- 商店 ---------- */
function renderShop(){
  const G=UI.G;
  endSelMode();
  showScreen('scr-shop');
  $('shop-money').textContent='$'+G.money;
  /* 代金券槽 */
  const vs=$('shop-voucher');vs.innerHTML='';
  for(const vkey of G.shop.voucher||[]){
    if(!vkey)continue;
    for(const v of vkey.split(',')){
      if(!v||G.vouchers.includes(v))continue;
      const slot=document.createElement('div');slot.className='shop-slot';
      const el=voucherEl(v);
      attachInfo(el,()=>voucherInfoHtml(v));
      const cost=Engine.priceOf(G,10);
      const btn=document.createElement('button');
      btn.className='buybtn'+(cost===0?' free':'');
      btn.textContent=cost===0?'免费领取':'$'+cost;
      btn.disabled=G.money<cost;
      btn.onclick=()=>{
        const r=Engine.buyVoucher(G,v);
        if(r.ok){Snd.cash();toast(VOUCHERS[v].n+'!');refreshAll();saveRun()}
        else{Snd.error();toast(r.error)}
      };
      slot.appendChild(el);slot.appendChild(btn);vs.appendChild(slot);
    }
  }
  /* 卡牌槽 */
  const cs=$('shop-cards');cs.innerHTML='';
  G.shop.items.forEach((it,i)=>{
    if(!it){const sold=document.createElement('div');sold.className='shop-slot';sold.innerHTML='<div class="soldout">已售出</div>';cs.appendChild(sold);return}
    const slot=document.createElement('div');slot.className='shop-slot';
    let el,label;
    if(it.kind==='joker'){
      const j=it.joker||{id:it.stock.id,ed:it.stock.ed,c:{}};
      el=jcardEl(j);
      attachInfo(el,()=>jokerInfoHtml(j));
      label=JOKERS[it.stock.id].n;
    }else if(it.kind==='playing'){
      el=pcardEl(it.card);
      attachInfo(el,()=>cardInfoHtml(it.card));
      label='扑克牌';
    }else{
      el=consumableEl({kind:it.kind,id:it.stock.id});
      attachInfo(el,()=>consumableInfoHtml({kind:it.kind,id:it.stock.id}));
      label={tarot:'塔罗牌',planet:'星球牌',spectral:'光谱牌'}[it.kind];
    }
    const cost=it.free?0:it.cost;
    const btn=document.createElement('button');
    btn.className='buybtn'+(cost===0?' free':'');
    btn.textContent=cost===0?'免费':'$'+cost;
    btn.disabled=!it.free&&G.money<cost;
    btn.onclick=()=>{
      const r=Engine.buyShopItem(G,i);
      if(r.ok){Snd.cash();toast('买下 '+label+'!');refreshAll();saveRun()}
      else{Snd.error();toast(r.error)}
    };
    slot.appendChild(el);slot.appendChild(btn);cs.appendChild(slot);
  });
  /* 卡包槽 */
  const ps=$('shop-packs');ps.innerHTML='';
  G.shop.packs.forEach((pk,i)=>{
    if(!pk){const sold=document.createElement('div');sold.className='shop-slot';sold.innerHTML='<div class="soldout">已卖完</div>';ps.appendChild(sold);return}
    const P=PACKS[pk.id];
    const slot=document.createElement('div');slot.className='shop-slot';
    const el=document.createElement('div');
    el.className='packface '+P.cls;
    el.innerHTML=`<span class="pf-emoji">${P.e}</span><span>${P.n}</span><span style="font-size:10px;opacity:.8">${P.d}</span>`;
    attachInfo(el,()=>`<div class="ip-name">${P.e} ${P.n}</div><div class="ip-desc">${P.d}</div>`);
    const cost=pk.free?0:pk.cost;
    const btn=document.createElement('button');
    btn.className='buybtn'+(cost===0?' free':'');
    btn.textContent=cost===0?'免费':'$'+cost;
    btn.disabled=!pk.free&&G.money<cost;
    btn.onclick=()=>{
      const r=Engine.buyPack(G,i);
      if(r.ok){Snd.pack();showPackOverlay(P.n)}
      else{Snd.error();toast(r.error)}
    };
    slot.appendChild(el);slot.appendChild(btn);ps.appendChild(slot);
  });
  /* 重掷 */
  let rc=G.shop.rerollCost;
  if(G.shop.d6Free>0)rc=0;
  $('reroll-cost').textContent=rc===0?'免费':'$'+rc;
  $('shop-reroll').disabled=G.money<rc;
  $('shop-reroll').onclick=()=>{
    const r=Engine.rerollShop(G);
    if(r.ok){Snd.reroll();renderShop();saveRun()}
    else{Snd.error();toast(r.error)}
  };
  $('shop-next').onclick=()=>{
    leaveShopUI();
  };
}
function leaveShopUI(){
  const G=UI.G;
  /* 佩尔科:离开商店复制消耗牌(负片?此处为复制) */
  for(const j of [...G.jokers]){
    const d=Engine.recalcJokerFlags?null:null;
    if(JOKERS[j.id].flags&&JOKERS[j.id].flags().perkeo&&!j.debuff){
      if(G.consumables.length<Engine.recalcStats(G).consumableSlots&&G.consumables.length){
        const cs=G.consumables[Math.floor(Math.random()*G.consumables.length)];
        G.consumables.push({kind:cs.kind,id:cs.id});
        toast('佩尔科:复制了一张「'+consDef(G.consumables.length-1).n+'」!');
        Snd.joker();
      }
      break;
    }
  }
  saveRun();
  renderBlindSelect();
}

/* ---------- 卡包开启 ---------- */
function showPackOverlay(title,after){
  const G=UI.G,P=G.pack;
  if(!P){after&&after();return}
  showScreen('scr-pack');
  $('pack-head').textContent=title||PACKS[P.typeId].n;
  const box=$('pack-cards');box.innerHTML='';
  $('pack-note').textContent='剩余选取次数:'+P.left;
  P.opts.forEach((opt,i)=>{
    if(!opt)return;
    const pick=document.createElement('div');pick.className='pick';
    let el;
    if(opt.kind==='joker'){el=jcardEl({id:opt.id,ed:opt.ed,c:{},uid:'tmp'+i});attachInfo(el,()=>jokerInfoHtml({id:opt.id,ed:opt.ed,c:{}}))}
    else if(opt.kind==='playing'){el=pcardEl(opt.card);attachInfo(el,()=>cardInfoHtml(opt.card))}
    else{el=consumableEl({kind:opt.kind,id:opt.id});attachInfo(el,()=>consumableInfoHtml({kind:opt.kind,id:opt.id}))}
    pick.appendChild(el);
    pick.onclick=()=>{
      const r=Engine.pickFromPack(G,i);
      if(r.error){Snd.error();toast(r.error);return}
      Snd.pack();
      if(r.done){G.pack=null;saveRun();after?after():renderShop()}
      else showPackOverlay(title,after);
    };
    box.appendChild(pick);
  });
  /* 跳过剩余 */
  let skip=$('pack-skip');
  if(!skip){
    skip=document.createElement('button');
    skip.id='pack-skip';
    skip.className='bigbtn dark';skip.textContent='跳过卡包';
    skip.onclick=()=>{G.pack=null;saveRun();after?after():renderShop()};
    $('pack-box').appendChild(skip);
  }
}

/* ---------- 结束 ---------- */
function onGameOver(won){
  const G=UI.G;
  clearRun();
  META.runs++;
  if(won){META.wins++;Snd.win();confetti(90)}
  else Snd.lose();
  if(G.ante>META.bestAnte)META.bestAnte=G.ante;
  saveMeta();
  const box=$('end-box');
  box.className='end-box '+(won?'win':'lose');
  $('end-title').textContent=won?'通关了!':'游戏结束';
  const st=$('end-stats');
  st.innerHTML=`
    <div>到达 <b>Ante ${G.ante}</b>${won?' · 8 个 Ante 全部拿下!':''}</div>
    <div>本局打出 <b>${G.stats.handsPlayed}</b> 手牌 · 金钱 <b class="px">$${G.money}</b></div>
    <div>小丑 <b>${G.jokers.length}</b> 张 · 最常打出 <b>${HANDS[Engine.mostPlayedHand(G)].n}</b> ×${G.handCounts[Engine.mostPlayedHand(G)]}</div>`;
  const btns=$('end-btns');btns.innerHTML='';
  if(won){
    const b1=document.createElement('button');b1.className='bigbtn gold';b1.textContent='无尽模式 →';
    b1.onclick=()=>{Engine.startEndless(G);UI.G=G;saveRun();renderBlindSelect()};
    btns.appendChild(b1);
  }
  const b2=document.createElement('button');b2.className='bigbtn red';b2.textContent='再来一局';
  b2.onclick=()=>{newRunFlow(UI.deckPick)};
  btns.appendChild(b2);
  const b3=document.createElement('button');b3.className='bigbtn dark';b3.textContent='回主菜单';
  b3.onclick=()=>{UI.G=null;showMenu()};
  btns.appendChild(b3);
  showScreen('scr-end');
}

/* ---------- 全局刷新 ---------- */
function refreshAll(){
  const G=UI.G;
  if(!G)return;
  if(G.phase==='play'||G.phase==='select'){
    if($('scr-game').classList.contains('on')){renderRail();renderTrays();renderHand()}
    else renderBlindSelect();
  }else if(G.phase==='shop')renderShop();
}

/* ---------- 菜单/牌背/战绩 ---------- */
function showMenu(){
  $('btn-continue').style.display=hasSave()?'':'none';
  $('menu-best').textContent=META.bestAnte;
  $('menu-wins').textContent=META.wins;
  showScreen('scr-menu');
}
function renderDeckGrid(pickMode){
  const grid=$('deck-grid');grid.innerHTML='';
  for(const[id,D]of Object.entries(DECKS)){
    const ok=deckUnlocked(id,META);
    const el=document.createElement('div');
    el.className='deck-item'+(UI.deckPick===id?' sel':'')+(ok?'':' locked');
    el.innerHTML=`
      <div class="di-back" style="background:${{red:'linear-gradient(145deg,#a33446,#5a1c28)',blue:'linear-gradient(145deg,#3459a3,#1c2d5a)',yellow:'linear-gradient(145deg,#c9a334,#8a6a1c)',white:'linear-gradient(145deg,#e8e4d8,#b8b2a0)',black:'linear-gradient(145deg,#2a2a33,#101014)',magic:'linear-gradient(145deg,#6b3da3,#33205a)',painted:'linear-gradient(145deg,#3da36b,#1c5a38)',checkered:'linear-gradient(145deg,#333,#000)',anaglyph:'linear-gradient(145deg,#c97034,#8a431c)',plasma:'linear-gradient(145deg,#8a34a3,#4a1c5a)'}[id]}"></div>
      <div class="di-name">${D.e} ${D.n}</div>
      <div class="di-desc">${D.d}</div>
      <div class="di-unlock">${ok?'':deckUnlockHint(id)}</div>
      ${ok?'':'<div class="di-lock">🔒</div>'}`;
    el.onclick=()=>{
      if(!ok){Snd.error();toast(deckUnlockHint(id));return}
      Snd.select();UI.deckPick=id;
      if(pickMode){startNewRun(id)}
      else renderDeckGrid(false);
    };
    grid.appendChild(el);
  }
}
function newRunFlow(){
  UI.deckPick='red';
  renderDeckGrid(true);
  showScreen('scr-decks');
}
function startNewRun(deckId){
  clearRun();
  UI.G=Engine.newRun(deckId);
  META.runs++;
  saveMeta();
  saveRun();
  renderBlindSelect();
}
function renderStats(){
  const grid=$('stat-grid');grid.innerHTML='';
  const items=[
    ['最高 Ante',META.bestAnte],['通关次数',META.wins],['总局数',META.runs],
    ['累计手牌',META.handsPlayed],['图鉴进度',Object.keys(JOKERS).length+' 张小丑'],
    ['音效',(META.sound?'开':'关')],
  ];
  for(const[k,v]of items){
    const el=document.createElement('div');el.className='stat-item';
    el.innerHTML=`<div class="si-lab">${k}</div><div class="si-val">${v}</div>`;
    grid.appendChild(el);
  }
}

/* ---------- 事件绑定 ---------- */
function bindGlobal(){
  $('btn-continue').onclick=()=>{
    Snd.unlock();Snd.click();
    const G=loadRun();
    if(!G){toast('没有进度');return}
    UI.G=G;
    routeByPhase();
  };
  $('btn-newrun').onclick=()=>{Snd.unlock();Snd.click();newRunFlow()};
  $('btn-decks').onclick=()=>{Snd.click();renderDeckGrid(false);showScreen('scr-decks')};
  $('btn-stats').onclick=()=>{Snd.click();renderStats();showScreen('scr-stats')};
  $('btn-howto').onclick=()=>{Snd.click();showScreen('scr-howto')};
  $('decks-back').onclick=()=>showMenu();
  $('stats-back').onclick=()=>showMenu();
  $('howto-back').onclick=()=>showMenu();
  $('blind-go').onclick=onBlindGo;
  $('btn-play').onclick=doPlay;
  $('btn-discard').onclick=doDiscard;
  $('btn-sort-rank').onclick=()=>{UI.sortMode='rank';$('btn-sort-rank').classList.add('sel');$('btn-sort-suit').classList.remove('sel');Snd.click();renderHand()};
  $('btn-sort-suit').onclick=()=>{UI.sortMode='suit';$('btn-sort-suit').classList.add('sel');$('btn-sort-rank').classList.remove('sel');Snd.click();renderHand()};
  $('tb-sound').onclick=()=>{
    META.sound=!META.sound;Snd.setMuted(!META.sound);saveMeta();
    $('tb-sound').textContent=META.sound?'🔊':'🔇';
    Snd.click();
  };
  $('tb-menu').onclick=()=>{
    confirmPop('暂停','要放弃本局回到主菜单吗?',[
      {txt:'放弃本局',cls:'red',cb:()=>{clearRun();UI.G=null;showMenu()}},
      {txt:'继续游戏',cls:'blue'}]);
  };
  $('cash-go');
}
function routeByPhase(){
  const G=UI.G;
  if(!G){showMenu();return}
  if(G.phase==='play'){showScreen('scr-game');renderRail();renderTrays();renderHand()}
  else if(G.phase==='select')renderBlindSelect();
  else if(G.phase==='shop')renderShop();
  else{clearRun();UI.G=null;showMenu()}
}

/* ---------- 启动 ---------- */
function boot(){
  loadMeta();
  Snd.setMuted(!META.sound);
  bindGlobal();
  if(META.sound)setTimeout(()=>{},0);
  showMenu();
  document.addEventListener('pointerdown',()=>Snd.unlock(),{once:true});
}

document.addEventListener('DOMContentLoaded',boot);
