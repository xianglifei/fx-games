/* ============================================================
   引擎层:纯逻辑,无 DOM。测试标记段供 node 提取。
   ============================================================ */
/*__ENGINE_BEGIN__*/

/* ---------- 种子随机 ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function makeRng(seed){const f=mulberry32(seed);return{f,next:()=>f(),int:n=>Math.floor(f()*n),pick:arr=>arr[Math.floor(f()*arr.length)],p:a=>f()<a,shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(f()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}}}
function seedFromStr(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19}return(h^=h>>>16)>>>0}

/* ---------- 数字格式化 ---------- */
const SUFFIX=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
function fmt(n){
  if(!isFinite(n))return'naneinf';
  if(n<0)return'-'+fmt(-n);
  if(n<10000)return String(Math.floor(n));
  let i=Math.floor(Math.log10(n)/3);
  if(i<SUFFIX.length){const v=n/Math.pow(10,i*3);return(v>=100?Math.floor(v):v.toFixed(1).replace(/\.0$/,''))+SUFFIX[i]}
  return n.toExponential(2).replace('+','');
}

/* ---------- 卡牌 ---------- */
let UID=1;
function makeCard(rank,suit){return{uid:UID++,rank,suit,enh:null,ed:null,seal:null,facedown:false,debuff:false}}
function buildDeck(deckId){
  UID=1;const d=[];const suits=DECKS[deckId]&&DECKS[deckId].mod.checkeredDeck?[0,1]:[0,1,2,3];
  for(const s of suits)for(let r=2;r<=14;r++){const n=suits.length===2?2:1;for(let k=0;k<n;k++)d.push(makeCard(r,s))}
  return d;
}
const RANK_NAME=r=>r<=10?String(r):RANK_STR[r];

/* ---------- 新的一局 ---------- */
function newRun(deckId,seedStr){
  const seed=seedStr?seedFromStr(seedStr):Date.now()%2**31;
  const deck=buildDeck(deckId);
  const G={
    seed:seedStr||String(seed),rng:seed,uidBase:UID,
    deckId,deck,pile:[],discards:[],hand:[],
    jokers:[],consumables:[],vouchers:[],pendingTags:[],
    money:4,ante:1,blind:'small',phase:'select',
    handLevels:Object.fromEntries(Object.keys(HANDS).map(h=>[h,1])),
    handCounts:Object.fromEntries(Object.keys(HANDS).map(h=>[h,0])),
    round:0,plays:0,playsMax:4,discardsLeft:0,score:0,target:0,
    bossId:null,bossPool:{},bossRerolled:0,
    shop:null,pack:null,
    stats:{handsPlayed:0,cardsPlayed:0,discarded:0,cardAdded:0,jacksDiscarded:0,earnings:0},
    roundStat:{},playedThisBlind:new Set(),roundHandTypes:[],
    selected:[],lastConsumable:null,skipCount:0,
    flags:{},bossDefeated:0,ev:[],
  };
  const dm=DECKS[deckId].mod;
  if(dm.money)G.money+=dm.money;
  if(dm.startVoucher)G.vouchers.push(dm.startVoucher);
  if(dm.startConsumable)G.consumables.push({kind:'tarot',id:dm.startConsumable});
  nextBoss(G);
  return G;
}
function serialize(G){
  return JSON.stringify({...G,playedThisBlind:[...G.playedThisBlind],rng:G.rng,uidBase:UID});
}
function deserialize(str){
  const o=JSON.parse(str);
  o.playedThisBlind=new Set(o.playedThisBlind);
  UID=o.uidBase||5000;
  return o;
}
function rng(G){return makeRng(G.rng)}
function rand(G){const r=makeRng(G.rng);G.rng=(G.rng+0x6D2B79F5|0)>>>0;return r}

/* ---------- 属性汇总 ---------- */
function recalcStats(G){
  let hands=4,discards=3,hs=8,jSlots=5,cSlots=2;
  const dm=DECKS[G.deckId].mod;
  hands+=dm.hands||0;discards+=dm.discards||0;hs+=dm.handSize||0;jSlots+=dm.jokerSlots||0;
  for(const v of G.vouchers){const p=VOUCHERS[v].passive&&VOUCHERS[v].passive();if(!p)continue;
    if(p.hands)hands+=p.hands;if(p.discards)discards+=p.discards;if(p.handSize)hs+=p.handSize;
    if(p.jokerSlots)jSlots+=p.jokerSlots;if(p.consumableSlots)cSlots+=p.consumableSlots;}
  for(const j of G.jokers){const d=JOKERS[j.id];
    const c={jk:j,c:j.c,G};
    const p=d.passive&&d.passive(c);if(!p)continue;
    if(p.handSize)hs+=p.handSize;}
  const boss=G.bossId&&G.phase!=='select'?BOSSES[G.bossId]:null;
  const chicot=G.jokers.some(j=>JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  if(boss&&boss.mod&&!chicot){
    if(boss.mod.handSize)hs+=boss.mod.handSize;
    if(boss.mod.absHands!==undefined)hands=boss.mod.absHands;
  }
  hands=Math.max(1,hands);discards=Math.max(0,discards);hs=Math.max(1,hs);jSlots=Math.max(1,jSlots);
  return{hands,discards,handSize:hs,jokerSlots:jSlots,consumableSlots:cSlots};
}

/* ---------- 牌型判定 ---------- */
function suitGroup(G,s){return JOKERS_active(G,'smeared')?(s===1||s===2?1:0):s}
function JOKERS_active(G,id){return G.jokers.some(j=>j.id===id&&!j.debuff)}
function effRank(c){return c.rank}
function evaluateHand(G,cards){
  const jk=recalcJokerFlags(G);
  const live=cards.filter(c=>c.enh!=='stone');
  const stones=cards.filter(c=>c.enh==='stone');
  const N=cards.length;
  const counts={},suitFixed={};
  for(const c of live){counts[c.rank]=(counts[c.rank]||0)+1;
    const g=suitGroup(G,c.suit);suitFixed[g]=suitFixed[g]||[];suitFixed[g].push(c)}
  const wilds=live.filter(c=>c.enh==='wild'&&!c.debuff);
  const need=jk.fourFingers?4:5;
  let isFlush=false;
  if(live.length>=need){
    for(const g of Object.keys(suitFixed)){
      const w=wilds.filter(w=>suitGroup(G,w.suit)!=+g);
      if(suitFixed[g].length>=need||(suitFixed[g].length+w.length>=need&&suitFixed[g].length>0)){isFlush=true;break}
    }
  }
  /* 顺子:A 可作 1 或 14 */
  const ranks=new Set();for(const c of live)ranks.add(c.rank),c.rank===14&&ranks.add(1);
  const wildN=wilds.length;
  let isStraight=false;
  const gapMax=jk.shortcut?2:1;
  const rs=[...ranks].sort((a,b)=>a-b);
  for(let i=0;i+need<=rs.length;i++){
    let okk=true;
    for(let k=1;k<need;k++){if(rs[i+k]-rs[i+k-1]>gapMax){okk=false;break}}
    if(okk){isStraight=true;break}
  }
  if(!isStraight&&wildN>0){
    for(let start=1;start<=14;start++){
      let miss=0,okk=true,prev=0;
      for(let k=0;k<need;k++){
        const r=start+k;
        if(r>14){okk=false;break}
        if(!ranks.has(r))miss++;
        if(prev&&r-prev>gapMax){okk=false;break}
        prev=r;
      }
      if(okk&&miss<=wildN){isStraight=true;break}
    }
  }
  let type='hc';
  const vals=Object.values(counts);
  const has=n=>vals.some(x=>x===n);
  const nPairs=vals.filter(x=>x===2).length;
  const fullHouse=vals.includes(3)&&vals.filter(x=>x>=2).length>=2;
  if(N>=5){
    if(isFlush&&has(5))type='ffive';
    else if(isFlush&&fullHouse&&vals.reduce((a,b)=>a+b,0)===5)type='fhouse';
    else if(has(5))type='five';
    else if(isFlush&&isStraight)type='sflush';
    else if(has(4))type='four';
    else if(fullHouse)type='full';
    else if(isFlush)type='flush';
    else if(isStraight)type='straight';
    else if(has(3))type='three';
    else if(nPairs>=2)type='two';
    else if(has(2))type='pair';
  }else{
    if(isFlush&&isStraight&&live.length>=4)type='sflush';
    else if(isFlush)type='flush';
    else if(isStraight)type='straight';
    else if(has(3))type='three';
    else if(nPairs>=2)type='two';
    else if(has(2))type='pair';
  }
  return{type,scoreCards:cards};
}
function recalcJokerFlags(G){
  const f={};
  for(const j of G.jokers){if(j.debuff)continue;const d=JOKERS[j.id];
    if(d.passive){const p=d.passive({jk:j,c:j.c,G});Object.assign(f,p||{})}}
  return f;
}
function handBase(G,type){
  const h=HANDS[type],lv=G.handLevels[type];
  let chips=h.base[0]+h.lv[0]*(lv-1),mult=h.base[1]+h.lv[1]*(lv-1);
  return{chips,mult};
}
function levelUpHand(G,type,n){G.handLevels[type]=Math.max(1,(G.handLevels[type]||1)+n)}
function mostPlayedHand(G){
  let best='hc',n=-1;
  for(const h of HAND_ORDER){if((G.handCounts[h]||0)>n){n=G.handCounts[h];best=h}}
  return best;
}

/* ---------- 计分上下文(小丑钩子用) ---------- */
function makeScoreCtx(G,jk,base){
  const ctx={
    G,jk,c:jk.c,handType:base.handType,played:base.played,scored:base.scored,
    held:()=>G.hand,chips:base.chips,mult:base.mult,handFlags:base.handFlags,
    addChips(n){if(n>0){base.chips+=n;base.ev.push({t:'chips',n,src:jk.id,uid:jk.uid})}},
    addMult(n){if(n>0){base.mult+=n;base.ev.push({t:'mult',n,src:jk.id,uid:jk.uid})}},
    xMult(x){if(x!==1){base.mult*=x;base.ev.push({t:'xmult',x,src:jk.id,uid:jk.uid})}},
    addMoney(n){G.money=Math.max(0,G.money+n);base.ev.push({t:'money',n})},
    money:()=>G.money,
    rank:cd=>cd.rank,suit:cd=>cd.suit,
    isSuit(cd,s){if(cd.debuff)return cd.suit===s;if(cd.enh==='wild')return true;const a=suitGroup(G,cd.suit),b=suitGroup(G,s);return a===b},
    isFace(cd){if(cd.debuff)return cd.rank>10;if(JOKERS_active(G,'pareidolia'))return true;return cd.rank>10},
    enhOf:cd=>cd.debuff?null:cd.enh,
    p:(a,b)=>{const r=rand(G);return r.next()*b<a?true:(base.ev.push({t:'fail',src:jk.id,uid:jk.uid}),false)},
    rand:n=>rand(G).int(n),pick:arr=>rand(G).pick(arr),
    retrigger(cd){base.retrig.push(cd)},
    stealEnh(cd){cd.enh=null;base.ev.push({t:'steal',uid:cd.uid})},
    discardsLeft:()=>G.discardsLeft,playsLeft:()=>G.plays,
    handCount:h=>G.handCounts[h]||0,mostPlayed:()=>mostPlayedHand(G),
    handRank:()=>HAND_ORDER.indexOf(base.handType),
    jcount(k){return base.handFlags[jk.uid+':'+k]||0},
    setj(k,v){base.handFlags[jk.uid+':'+k]=v},
    roundStat(k){return G.roundStat[k]||0},
    runStat(k){return G.stats[k]||0},
    emptyJokerSlots(){return recalcStats(G).jokerSlots-G.jokers.length},
    leftSellValue(){const i=G.jokers.indexOf(jk);return i>0?sellValueOf(G.jokers[i-1]):0},
    hasSmeared:()=>JOKERS_active(G,'smeared'),
    isSuitG(cd){return suitGroup(G,cd.enh==='wild'&&!cd.debuff?Math.max(0,suitGroup(G,cd.suit)):suitGroup(G,cd.suit))},
  };
  return ctx;
}
function sellValueOf(j){return Math.max(1,Math.floor((JOKERS[j.id].cost+(j.ed?2:0))/2)+(j.sellBonus||0))}
function notifyExt(G,evt){
  for(const j of G.jokers){const d=JOKERS[j.id];if(d.extEvent===evt&&!j.debuff){
    if(evt==='planetUsed')j.c.x=(j.c.x||0)+0.1;
    if(evt==='cardAdded')j.c.x=(j.c.x||0)+0.25;
    if(evt==='glassBroke')j.c.x=(j.c.x||0)+0.2;
    if(evt==='faceDestroyed')j.c.mult=(j.c.mult||0)+1;
    if(evt==='discardMilestone')j.c.x=(j.c.x||1)+0.1;
  }}
}

/* ---------- 打出一手牌(核心流水线) ---------- */
function playHand(G){
  const ev=[];
  G.ev=ev;
  const sel=G.selected.map(uid=>G.hand.find(c=>c.uid===uid)).filter(Boolean);
  const st=recalcStats(G);
  const boss=activeBoss(G);
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  const bFlags=bossFlags(G,boss);
  if(!sel.length)return{error:'至少选择 1 张牌'};
  if(sel.length>5)return{error:'最多打出 5 张牌'};
  if(bFlags.mustPlay5&&sel.length!==5)return{error:'「'+boss.n+'」:必须一次打出 5 张牌'};
  /* 牌型判定 */
  const res=evaluateHand(G,sel);
  const ht=res.type;
  if(bFlags.oneHandType&&G.roundHandTypes.length&&G.roundHandTypes[0]!==ht)
    return{error:'「'+boss.n+'」:本回合只能打出「'+HANDS[G.roundHandTypes[0]].n+'」'};
  if(bFlags.noRepeatHands&&G.roundHandTypes.includes(ht))
    return{error:'「'+boss.n+'」:「'+HANDS[ht].n+'」已经打过了'};
  /* 扣次数 */
  G.plays--;
  G.roundHandTypes.push(ht);
  G.handCounts[ht]=(G.handCounts[ht]||0)+1;
  G.stats.handsPlayed++;
  /* 从手牌移除 */
  for(const c of sel){const i=G.hand.indexOf(c);if(i>=0)G.hand.splice(i,1)}
  /* 绯红之心:每手随机禁用一张小丑 */
  if(bFlags.crimsonHeart&&G.jokers.length){
    G.jokers.forEach(j=>j.debuff=false);
    const victim=rand(G).pick(G.jokers);victim.debuff=true;
    ev.push({t:'crimson',id:victim.id});
  }
  /* 基础分 */
  let{chips,mult}=handBase(G,ht);
  if(bFlags.halveBase){chips=Math.floor(chips/2);mult=Math.floor(mult/2)}
  ev.push({t:'hand',hand:ht,chips,mult});
  /* Arm:打出的牌型降级(在计分前) */
  if(boss&&boss.onScoreStart&&!chicot)boss.onScoreStart(G,ht);
  /* 铁钩等:打出前钩子 */
  if(boss&&boss.onPlayHand&&!chicot)boss.onPlayHand(G,sel,ht);
  if(boss&&boss.onHandPlayed&&!chicot)boss.onHandPlayed(G,ht,mostPlayedHand(G));
  /* 毒牙 */
  /* 计分上下文 */
  const base={handType:ht,played:sel,scored:sel.filter(c=>!c.debuff),chips,mult,ev,retrig:[],handFlags:{}};
  const heldCards=[...G.hand];
  /* --- 逐张打出的牌 --- */
  for(const cd of sel){
    scoreOneCard(G,base,cd,1);
  }
  /* 重触发队列 */
  let guard=0;
  while(base.retrig.length&&guard++<40){
    const cd=base.retrig.shift();
    if(!sel.includes(cd)||cd.debuff)continue;
    scoreOneCard(G,base,cd,0);
  }
  /* --- 手中的牌(钢铁/男爵等) --- */
  for(const cd of heldCards){
    if(cd.debuff)continue;
    const times=cd.seal==='red'&&!cd.debuff?2:1;
    for(let t=0;t<times;t++){
      if(cd.enh==='steel'){
        base.mult*=1.5;ev.push({t:'xmult',x:1.5,uid:cd.uid,card:true});
      }
      for(const j of G.jokers){
        if(j.debuff)continue;
        const real=resolveJoker(G,j);
        if(real&&real.onHeld){const ctx=makeScoreCtx(G,j,base);real.onHeld(ctx,cd)}
      }
    }
  }
  /* --- 小丑 onHandScore --- */
  for(const j of G.jokers){
    if(j.debuff)continue;
    const real=resolveJoker(G,j);
    if(real&&real.onHandScore){const ctx=makeScoreCtx(G,j,base);real.onHandScore(ctx)}
  }
  /* 天文台:手上的星球牌加成 */
  for(const cs of G.consumables){
    if(cs.kind==='planet'&&PLANETS[cs.id].hand===ht&&G.vouchers.includes('observatory')){
      base.mult*=1.5;ev.push({t:'xmult',x:1.5,src:cs.id});
    }
  }
  /* --- 结算 --- */
  let gained;
  const dm=DECKS[G.deckId].mod;
  if(dm.plasma){const s=base.chips+base.mult;gained=Math.floor((s/2)*(s/2))}
  else gained=Math.floor(base.chips*base.mult);
  G.score+=gained;
  ev.push({t:'total',chips:Math.floor(base.chips),mult:Math.round(base.mult*100)/100,gained,score:G.score});
  /* 牌进弃牌堆,清背面 */
  for(const c of sel){if(!G.deck.includes(c))continue;c.facedown=false;c.debuff=false;G.discards.push(c);G.stats.cardsPlayed++;G.playedThisBlind.add(c.uid)}
  /* 幸运/玻璃结算已在 scoreOneCard 内 */
  /* 抽牌 */
  if(bFlags.serpent)drawCards(G,3);
  else drawCards(G,st.handSize-G.hand.length);
  /* 铁钩:随机弃 2 张 */
  if(G.pendingDiscardRandom&&!chicot){
    const n=Math.min(G.pendingDiscardRandom,G.hand.length);
    for(let i=0;i<n;i++){const idx=rand(G).int(G.hand.length);const[c]=G.hand.splice(idx,1);G.discards.push(c);ev.push({t:'bossDiscard',uid:c.uid})}
    G.pendingDiscardRandom=0;
  }
  G.selected=[];
  const won=G.score>=G.target;
  const lost=!won&&G.plays<=0;
  return{hand:ht,gained,won,lost,ev};
}
function scoreOneCard(G,base,cd,first){
  const ev=base.ev;
  if(cd.debuff){ev.push({t:'debuffCard',uid:cd.uid});return}
  cd.facedown=false;
  const times=cd.seal==='red'?2:1;
  for(let t=0;t<times;t++){
    /* 基础筹码 */
    let ch=0;
    if(cd.enh==='stone')ch=50;
    else ch=cd.rank===14?11:cd.rank>=11&&cd.rank<=13?10:cd.rank;
    base.chips+=ch;
    ev.push({t:'card',uid:cd.uid,chips:ch,repeat:t>0});
    /* 版本 */
    if(cd.ed==='foil'){base.chips+=50;ev.push({t:'chips',n:50,uid:cd.uid})}
    if(cd.ed==='holo'){base.mult+=10;ev.push({t:'mult',n:10,uid:cd.uid})}
    if(cd.ed==='poly'){base.mult*=1.5;ev.push({t:'xmult',x:1.5,uid:cd.uid})}
    /* 强化 */
    if(cd.enh==='bonus'){base.chips+=30;ev.push({t:'chips',n:30,uid:cd.uid})}
    if(cd.enh==='mult'){base.mult+=4;ev.push({t:'mult',n:4,uid:cd.uid})}
    if(cd.enh==='glass'){base.mult*=2;ev.push({t:'xmult',x:2,uid:cd.uid})}
    if(cd.enh==='lucky'){
      const r=rand(G);
      if(r.next()<1/5){base.mult+=20;ev.push({t:'mult',n:20,uid:cd.uid,lucky:true})}
      if(r.next()<1/15){G.money+=20;ev.push({t:'money',n:20,lucky:true})}
    }
    if(cd.seal==='gold'){G.money+=3;ev.push({t:'money',n:3,seal:true})}
    /* 小丑逐张响应 */
    for(const j of G.jokers){
      if(j.debuff)continue;
      const real=resolveJoker(G,j);
      if(real&&real.onCardScore){const ctx=makeScoreCtx(G,j,base);real.onCardScore(ctx,cd)}
    }
  }
  /* 玻璃碎裂 */
  if(cd.enh==='glass'&&rand(G).p(1/4)){
    const i=G.deck.indexOf(cd);
    const hd=G.hand.indexOf(cd);if(hd>=0)G.hand.splice(hd,1);
    const dp=G.discards.indexOf(cd);if(dp>=0)G.discards.splice(dp,1);
    if(i>=0)G.deck.splice(i,1);
    notifyExt(G,'glassBroke');
    if(cd.rank>10)notifyExt(G,'faceDestroyed');
    ev.push({t:'glassBreak',uid:cd.uid});
  }
}
/* 蓝图/头脑风暴:解析复制目标 */
function resolveJoker(G,j){
  const d=JOKERS[j.id];
  if(!d.copyOf)return d.debuff?null:d;
  if(j.debuff)return null;
  const i=G.jokers.indexOf(j);
  let t=null;
  if(d.copyOf==='left'&&i>0)t=G.jokers[i-1];
  if(d.copyOf==='first'&&G.jokers.length)t=G.jokers[0];
  if(!t||t===j||t.debuff)return null;
  const td=JOKERS[t.id];
  if(td.copyOf)return null;
  return td;
}
/*__ENGINE_END__*/

/* ---------- 抽牌 / 弃牌 ---------- */
function bossFlags(G,boss){
  if(!boss)return{};
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  if(chicot)return{};
  const f=boss.flags;
  return typeof f==='function'?f():(f||{});
}
function reshuffleDiscards(G){
  if(!G.discards.length)return;
  const r=rand(G);r.shuffle(G.discards);
  G.pile.push(...G.discards);G.discards=[];
}
function activeBoss(G){
  return G.blind==='boss'&&G.bossId?BOSSES[G.bossId]:null;
}
function bossDebuff(G,c){
  if(G.phase!=='play')return false;
  const boss=activeBoss(G);
  if(!boss)return false;
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  if(chicot)return false;
  if(boss.debuff&&boss.debuff(c))return true;
  const f=boss.flags,f2=typeof f==='function'?f():(f||{});
  if(f2.debuffAll&&!G.leafCleared)return true;
  if(boss.debuffDynamic&&boss.debuffDynamic(G,c))return true;
  return false;
}
function drawCards(G,n,ev){
  ev=ev||G.ev;
  const boss=activeBoss(G);
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  for(let i=0;i<n;i++){
    if(!G.pile.length)reshuffleDiscards(G);
    if(!G.pile.length)break;
    const c=G.pile.pop();
    let fd=false;
    if(G.drawFacedownNext>0){fd=true;G.drawFacedownNext--}
    else if(G.facedownMode&&!chicot)fd=true;
    else if(boss&&boss.drawFacedown&&!chicot)fd=boss.drawFacedown(G,c,rand(G));
    c.facedown=fd;
    c.debuff=bossDebuff(G,c);
    G.hand.push(c);
    ev&&ev.push({t:'draw',uid:c.uid});
  }
}
function removeCardEverywhere(G,card){
  let i=G.deck.indexOf(card);if(i>=0)G.deck.splice(i,1);
  i=G.pile.indexOf(card);if(i>=0)G.pile.splice(i,1);
  i=G.hand.indexOf(card);if(i>=0)G.hand.splice(i,1);
  i=G.discards.indexOf(card);if(i>=0)G.discards.splice(i,1);
}
function addCardToDeck(G,card){
  G.deck.push(card);
  const i=G.pile.length?rand(G).int(G.pile.length+1):0;
  G.pile.splice(i,0,card);
  G.stats.cardAdded++;notifyExt(G,'cardAdded');
}
function discardSelected(G){
  const ev=[];G.ev=ev;
  const st=recalcStats(G);
  const sel=G.selected.map(uid=>G.hand.find(c=>c.uid===uid)).filter(Boolean);
  if(!sel.length)return{error:'至少选择 1 张牌'};
  if(sel.length>G.discardsLeft)return{error:'弃牌机会不足'};
  if(sel.length>G.hand.length)return{error:'选择无效'};
  G.discardsLeft-=sel.length;
  const boss=activeBoss(G);
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  for(const c of sel){
    const i=G.hand.indexOf(c);G.hand.splice(i,1);
    c.facedown=false;G.discards.push(c);
    ev.push({t:'discard',uid:c.uid});
    G.stats.discarded++;
    if(c.rank===11){G.roundStat.jacksDiscarded=(G.roundStat.jacksDiscarded||0)+1}
    if(c.seal==='purple'&&!c.debuff&&G.consumables.length<st.consumableSlots){
      G.consumables.push({kind:'tarot',id:rand(G).pick(Object.keys(TAROTS))});
      ev.push({t:'purpleSeal'});
    }
  }
  G.stats.discarded+=0;
  const milestones=Math.floor(G.stats.discarded/10)-(G.yorickMark||0);
  for(let k=0;k<milestones;k++)notifyExt(G,'discardMilestone');
  G.yorickMark=Math.floor(G.stats.discarded/10);
  /* 小丑弃牌钩子 */
  for(const j of G.jokers){
    if(j.debuff)continue;
    const d=resolveJoker(G,j);
    if(d&&d.onDiscard){const ctx=makeScoreCtx(G,j,{handType:'hc',played:[],scored:[],chips:0,mult:0,ev,retrig:[],handFlags:{},discardsLeftOverride:G.discardsLeft});ctx.discardsLeft=()=>G.discardsLeft;d.onDiscard(ctx,sel)}
  }
  G.selected=[];
  if(bFlags_serpent(G,chicot))drawCards(G,3,ev);else drawCards(G,st.handSize-G.hand.length,ev);
  return{ev};
}
function bFlags_serpent(G,chicot){
  const boss=activeBoss(G);
  if(!boss||chicot)return false;
  const f=typeof boss.flags==='function'?boss.flags():(boss.flags||{});
  return !!f.serpent;
}

/* ---------- Boss 盲注抽取 ---------- */
function nextBoss(G){
  const isShowdown=G.ante%8===0;
  const pool=isShowdown?[...SHOWDOWN_BOSSES]:NORMAL_BOSSES.filter(id=>BOSSES[id].minAnte<=G.ante);
  let min=Infinity,cands=[];
  for(const id of pool){const n=(G.bossPool[id]||0);if(n<min){min=n;cands=[id]}else if(n===min)cands.push(id)}
  G.bossId=rand(G).pick(cands);
  G.bossPool[G.bossId]=(G.bossPool[G.bossId]||0)+1;
  G.bossRerolled=0;
}
function rerollBoss(G){
  const can=G.vouchers.includes('retcon')||G.bossRerolled===0;
  if(!can)return{error:'本盲注已重掷过'};
  if(G.money<10)return{error:'重掷需要 $10'};
  G.money-=10;G.bossRerolled++;
  G.bossPool[G.bossId]--;
  nextBoss(G);
  return{ok:true};
}
function anteBase(G){return ANTE_BASE[Math.min(G.ante,16)]||ANTE_BASE[16]}

/* ---------- 盲注流程 ---------- */
function blindTarget(G){
  const boss=BOSSES[G.bossId];
  let base=anteBase(G);
  if(G.blind==='small')base*=1;else if(G.blind==='big')base*=1.5;else base*=boss.mult;
  if(DECKS[G.deckId].mod.targetMult)base*=DECKS[G.deckId].mod.targetMult;
  return Math.floor(base);
}
function startBlind(G,type){
  G.blind=type;
  const st=recalcStats(G);
  G.phase='play';
  G.score=0;G.roundStat={};G.playedThisBlind=new Set();G.roundHandTypes=[];
  G.target=blindTarget(G);
  const boss=activeBoss(G);
  const chicot=G.jokers.some(j=>!j.debuff&&JOKERS[j.id].flags&&JOKERS[j.id].flags().ignoreBoss);
  const bf=bossFlags(G,boss);
  const dm=DECKS[G.deckId].mod;
  G.playsMax=st.hands;
  G.plays=st.hands;
  G.discardsLeft=bf.zeroDiscards?0:st.discards;
  /* 杂耍标签:本回合 +3 手牌上限 */
  G.tempHandSize=0;
  if(G.pendingTags.includes('juggle')){G.tempHandSize=3;G.pendingTags=G.pendingTags.filter(t=>t!=='juggle')}
  const handSize=st.handSize+G.tempHandSize;
  /* 重洗牌堆 */
  G.pile=rand(G).shuffle([...G.deck]);
  G.discards=[];G.hand=[];
  G.facedownMode=false;
  if(boss&&boss.onRoundStart&&!chicot)boss.onRoundStart(G);
  if(boss&&boss.n==='房屋'&&!chicot)G.drawFacedownNext=handSize;
  G.ev=[{t:'blindStart'}];
  drawCards(G,handSize,G.ev);
  return{ok:true};
}
function skipBlind(G){
  if(G.blind==='boss')return{error:'Boss 盲注不能跳过'};
  const tag=G.shownTag||rollTag(G);G.shownTag=null;
  const dupe=G.nextTagDupe||0;
  G.nextTagDupe=0;
  G.skipCount++;
  const applied=[tag];if(dupe)applied.push(tag);
  let openPack=null;
  for(const t of applied){const r=applyTag(G,t);if(r&&r.openPack)openPack=r.openPack}
  G.ev=[{t:'skip',tag,dup:dupe>0}];
  advanceBlind(G);
  return{tag,dup:dupe>0,openPack,ev:G.ev};
}
function advanceBlind(G){
  if(G.blind==='small')G.blind='big';
  else if(G.blind==='big'){G.blind='boss'}
  G.phase='select';
}
function rollTag(G){
  const avail=['uncommon','rare','investment','voucher','boss','charm','coupon','double','juggle','d6','speed','standard','meteor','buffoon','handy','garbage','ethereal','topup','orbital','ruby','foil','holo','poly','negative'];
  return rand(G).pick(avail);
}
function applyTag(G,tagId){
  const t=TAGS[tagId];
  switch(tagId){
    case 'boss':{rerollBossFree(G);return{}}
    case 'speed':addMoneyG(G,5*G.skipCount);return{};
    case 'handy':addMoneyG(G,G.stats.handsPlayed);return{};
    case 'garbage':addMoneyG(G,G.stats.discardsUnused||0);return{};
    case 'ruby':addMoneyG(G,10);return{};
    case 'orbital':{const h=rand(G).pick(Object.keys(HANDS));levelUpHand(G,h,3);return{levelHand:h}}
    case 'topup':{let n=0;const st=recalcStats(G);while(n<2&&G.jokers.length<st.jokerSlots){mkJokerG(G,1);n++}return{}}
    case 'double':{G.nextTagDupe=(G.nextTagDupe||0)+1;return{}}
    case 'charm':return{openPack:'arcanaM'};
    case 'standard':return{openPack:'standardM'};
    case 'meteor':return{openPack:'celestialM'};
    case 'buffoon':return{openPack:'buffoonM'};
    case 'ethereal':return{openPack:'spectral'};
    default:G.pendingTags.push(tagId);return{};
  }
}
function rerollBossFree(G){G.bossPool[G.bossId]--;nextBoss(G)}
function addMoneyG(G,n){G.money=Math.max(0,G.money+n);G.ev.push({t:'money',n})}

/* ---------- 回合胜利结算 ---------- */
function cashoutRewards(G){
  const items=[];
  const boss=G.bossId?BOSSES[G.bossId]:null;
  const isShowdown=boss&&boss.showdown;
  const baseAmt=G.blind==='small'?3:G.blind==='big'?4:isShowdown?8:5;
  items.push({lab:G.blind==='small'?'小盲注':G.blind==='big'?'大盲注':'Boss 盲注',n:baseAmt});
  if(G.plays>0)items.push({lab:'剩余出牌 ×'+G.plays,n:G.plays});
  if(G.discardsLeft>0)items.push({lab:'剩余弃牌 ×'+G.discardsLeft,n:G.discardsLeft});
  const gold=G.hand.filter(c=>c.enh==='gold'&&!c.debuff).length;
  if(gold)items.push({lab:'黄金卡 ×'+gold,n:gold*3});
  const cap=G.vouchers.includes('moneyTree')?20:G.vouchers.includes('seedMoney')?10:5;
  const interest=Math.min(cap,Math.floor(G.money/5));
  if(interest>0)items.push({lab:'利息($5 = $1)',n:interest});
  /* 小丑回合结束钩子 */
  const destroyed=[];
  const ev=[];
  for(const j of [...G.jokers]){
    if(j.debuff)continue;
    const d=resolveJoker(G,j);
    if(d&&d.onRoundEnd){
      const ctx={G,jk:j,c:j.c,addMoney(n){ev.push({t:'money',n,src:j.id})},held:()=>G.hand,p:(a,b)=>rand(G).next()*b<a,pick:a=>rand(G).pick(a),suit:cd=>cd.suit,rank:cd=>cd.rank,isFace:cd=>cd.rank>10};
      const r=d.onRoundEnd(ctx);
      if(r&&r.destroy){destroyed.push(j);ev.push({t:'jokerDestroyed',id:j.id})}
    }
  }
  G.stats.discardsUnused=(G.stats.discardsUnused||0)+G.discardsLeft;
  /* 浅浮雕牌背:击败 Boss 送加倍标签 */
  if(DECKS[G.deckId].mod.anaglyph&&G.blind==='boss')G.pendingTags.push('double');
  if(G.blind==='boss'){
    if(G.pendingTags.includes('investment')){items.push({lab:'投资标签',n:25});G.pendingTags=G.pendingTags.filter(t=>t!=='investment')}
    G.bossDefeated++;
  }
  return{items,ev,destroyed};
}
function finishCashout(G,rewards){
  let total=0;
  for(const it of rewards.items)total+=it.n;
  G.money=Math.max(0,G.money+total);
  for(const e of rewards.ev){if(e.t==='money')G.money=Math.max(0,G.money+e.n)}
  for(const j of rewards.destroyed){const i=G.jokers.indexOf(j);if(i>=0)G.jokers.splice(i,1)}
  if(G.blind==='boss'){
    G.round=0;
    if(G.ante===8){G.phase='won';return{won:true}}
    G.ante++;nextBoss(G);G.blind='small';
  }else{
    advanceBlind(G);
  }
  G.phase='select';
  G.bonesUsed=false;
  return{ok:true};
}
function roundLost(G){
  G.phase='lost';
  /* 骨先生:≥25% 可续命(每盲注一次) */
  const mb=G.jokers.find(j=>j.id==='mrBones'&&!j.debuff);
  if(mb&&!G.bonesUsed){
    if(G.score>=G.target*0.25){
      G.bonesUsed=true;
      return{saved:true};
    }
  }
  return{saved:false};
}

/* ---------- 商店 ---------- */
function mkJokerG(G,rarity,ed){
  const st=recalcStats(G);
  if(G.jokers.length>=st.jokerSlots)return null;
  let pool;
  if(rarity==='legend')pool=Object.keys(JOKERS).filter(k=>JOKERS[k].r===4);
  else{
    pool=Object.keys(JOKERS).filter(k=>JOKERS[k].r===rarity);
    if(!pool.length)return null;
  }
  const id=rand(G).pick(pool);
  const j={id,ed:ed||null,c:{},uid:'j'+(UID++)};
  G.jokers.push(j);
  return j;
}
function shopPrices(G){
  const disc=G.vouchers.includes('clearance2')?.5:G.vouchers.includes('clearance')?.75:1;
  return{disc,free:G.pendingTags.includes('coupon')};
}
function priceOf(G,cost){const p=shopPrices(G);return Math.max(1,Math.floor(cost*p.disc))}
function genShopItem(G){
  const w=[];
  const vt=G.vouchers;
  w.push(['joker',20]);
  w.push(['tarot',4*(vt.includes('tarotT')?4:vt.includes('tarotM')?2:1)]);
  w.push(['planet',4*(vt.includes('planetT')?4:vt.includes('planetM')?2:1)]);
  if(vt.includes('magicTrick'))w.push(['playing',4]);
  if(G.deckId==='ghost')w.push(['spectral',2]);
  let total=0;for(const[,n]of w)total+=n;
  let r=rand(G).next()*total,kind='joker';
  for(const[k,n]of w){r-=n;if(r<=0){kind=k;break}}
  const edRate=vt.includes('hone2')?4:vt.includes('hone')?2:1;
  let ed=null;
  if(kind==='joker'&&rand(G).next()<0.03*edRate)ed=rand(G).pick(['foil','holo','poly']);
  if(kind==='joker'){
    /* 标签注入的免费小丑优先 */
    for(const special of ['uncommon','rare','negative','foil','holo','poly']){
      if(G.pendingTags.includes(special)){
        const rar=special==='uncommon'?2:special==='rare'?3:1;
        const ped=special==='uncommon'||special==='rare'?null:{negative:'negative',foil:'foil',holo:'holo',poly:'poly'}[special];
        const j=mkJokerG(G,rar,ped);
        G.pendingTags=G.pendingTags.filter(t=>t!==special);
        if(j)return{kind:'joker',joker:j,free:true};
      }
    }
    const r1=rand(G).next();
    const rar=r1<0.7?1:r1<0.95?2:3;
    const pool=Object.keys(JOKERS).filter(k=>JOKERS[k].r===rar);
    const id=rand(G).pick(pool);
    return{kind:'joker',stock:{id,ed},cost:priceOf(G,JOKERS[id].cost)};
  }
  if(kind==='tarot'){const id=rand(G).pick(Object.keys(TAROTS));return{kind:'tarot',stock:{id},cost:priceOf(G,3)}}
  if(kind==='planet'){const id=rand(G).pick(Object.keys(PLANETS));return{kind:'planet',stock:{id},cost:priceOf(G,3)}}
  if(kind==='spectral'){const id=rand(G).pick(Object.keys(SPECTRALS).filter(k=>k!=='soul'));return{kind:'spectral',stock:{id},cost:priceOf(G,4)}}
  const c=makeCard(rand(G).int(13)+2,rand(G).int(4));
  if(G.vouchers.includes('illusion')){
    if(rand(G).p(1/4))c.enh=rand(G).pick(Object.keys(ENH_META));
    if(rand(G).p(1/8))c.ed=rand(G).pick(['foil','holo','poly']);
    if(rand(G).p(1/10))c.seal=rand(G).pick(['red','gold','blue','purple']);
  }
  return{kind:'playing',card:c,cost:priceOf(G,1)};
}
function genShopPack(G,forceType){
  if(forceType)return{id:forceType,cost:PACKS[forceType].cost,free:false};
  const types=['standard','buffoon','arcana','celestial'];
  let id=rand(G).pick(types);
  if(rand(G).p(1/4))id=id+'M';
  if(G.deckId==='ghost'&&rand(G).p(1/4))id='spectral';
  return{id,cost:PACKS[id].cost,free:false};
}
function startShop(G){
  G.phase='shop';
  const st=recalcStats(G);
  const slots=2+(G.vouchers.includes('overstock2')?2:G.vouchers.includes('overstock')?1:0);
  const items=[];
  for(let i=0;i<slots;i++)items.push(genShopItem(G));
  const packs=[];
  if(!G.shopSeen){packs.push(genShopPack(G,'buffoon'));G.shopSeen=true}
  while(packs.length<2)packs.push(genShopPack(G));
  /* 代金券槽 */
  let voucher=null;
  const nV=G.pendingTags.includes('voucher')?2:1;
  const bought=[];
  const upgBase=v=>Object.keys(VOUCHERS).find(k=>VOUCHERS[k].up===v);
  for(let i=0;i<nV;i++){
    const pool=Object.keys(VOUCHERS).filter(v=>!G.vouchers.includes(v)&&!bought.includes(v)&&(!upgBase(v)||G.vouchers.includes(upgBase(v))));
    if(pool.length){const v=rand(G).pick(pool);bought.push(v);if(!voucher)voucher=v;else voucher=voucher+','+v}
  }
  if(G.pendingTags.includes('voucher'))G.pendingTags=G.pendingTags.filter(t=>t!=='voucher');
  G.shop={items,packs,voucher:voucher?[voucher]:[],rerollCost:Math.max(0,5-(G.vouchers.includes('rerollS2')?4:G.vouchers.includes('rerollS')?2:0)),rerolls:0,d6Free:0};
  if(G.pendingTags.includes('d6')){G.shop.d6Free=5;G.pendingTags=G.pendingTags.filter(t=>t!=='d6')}
  G.ev=[{t:'shop'}];
  return G.shop;
}
function rerollShop(G){
  const s=G.shop;
  let cost=s.rerollCost;
  if(s.d6Free>0){cost=0;s.d6Free--}
  if(G.money<cost)return{error:'钱不够'};
  G.money-=cost;
  s.rerolls++;s.rerollCost++;
  for(let i=0;i<s.items.length;i++)s.items[i]=genShopItem(G);
  G.ev=[{t:'reroll',cost}];
  return{ok:true};
}
function buyShopItem(G,i){
  const s=G.shop,it=s.items[i];
  if(!it)return{error:'无此商品'};
  const st=recalcStats(G);
  const cost=it.free?0:it.cost;
  if(G.money<cost)return{error:'钱不够'};
  if(it.kind==='joker'){
    const j=it.joker?it.joker:{id:it.stock.id,ed:it.stock.ed,c:{},uid:'j'+(UID++)};
    if(G.jokers.length>=st.jokerSlots)return{error:'小丑槽位已满'};
    G.money-=cost;G.jokers.push(j);
  }else if(it.kind==='tarot'||it.kind==='planet'||it.kind==='spectral'){
    if(G.consumables.length>=st.consumableSlots)return{error:'消耗牌槽位已满'};
    G.money-=cost;G.consumables.push({kind:it.kind,id:it.stock.id});
  }else if(it.kind==='playing'){
    G.money-=cost;addCardToDeck(G,it.card);
  }
  s.items[i]=null;
  G.ev=[{t:'buy',i}];
  return{ok:true};
}
function buyVoucher(G,key){
  const id=key;
  if(G.vouchers.includes(id))return{error:'已拥有'};
  const cost=priceOf(G,10);
  if(G.money<cost)return{error:'钱不够'};
  G.money-=cost;
  G.vouchers.push(id);
  G.ev=[{t:'voucher',id}];
  return{ok:true};
}
function buyPack(G,i){
  const s=G.shop,pk=s.packs[i];
  if(!pk)return{error:'卡包不存在'};
  const cost=pk.free?0:pk.cost;
  if(G.money<cost)return{error:'钱不够'};
  G.money-=cost;
  G.pack=openPack(G,pk.id);
  s.packs[i]=null;
  return{ok:true,pack:G.pack};
}
function openPack(G,typeId){
  const P=PACKS[typeId];
  const opts=[];
  for(let i=0;i<P.opts;i++){
    if(P.kind==='joker'){
      const pool=Object.keys(JOKERS).filter(k=>JOKERS[k].r<=2);
      let ed=null;
      const edRate=G.vouchers.includes('hone2')?4:G.vouchers.includes('hone')?2:1;
      if(rand(G).next()<0.05*edRate)ed=rand(G).pick(['foil','holo','poly']);
      opts.push({kind:'joker',id:rand(G).pick(pool),ed});
    }else if(P.kind==='tarot'){
      if(G.vouchers.includes('omenGlobe')&&rand(G).p(1/6))opts.push({kind:'spectral',id:rand(G).pick(Object.keys(SPECTRALS).filter(k=>k!=='soul'))});
      else opts.push({kind:'tarot',id:rand(G).pick(Object.keys(TAROTS))});
    }else if(P.kind==='planet'){
      if(G.vouchers.includes('telescope')&&i===0)opts.push({kind:'planet',id:HANDS[mostPlayedHand(G)].planet});
      else opts.push({kind:'planet',id:rand(G).pick(Object.keys(PLANETS))});
    }else if(P.kind==='spectral'){
      opts.push({kind:'spectral',id:rand(G).pick(Object.keys(SPECTRALS))});
    }else{
      const c=makeCard(rand(G).int(13)+2,rand(G).int(4));
      if(rand(G).p(2/7))c.enh=rand(G).pick(Object.keys(ENH_META));
      if(rand(G).p(1/7))c.ed=rand(G).pick(['foil','holo','poly']);
      if(rand(G).p(1/12))c.seal=rand(G).pick(['red','gold','blue','purple']);
      opts.push({kind:'playing',card:c});
    }
  }
  return{typeId,opts,left:P.picks};
}
function pickFromPack(G,idx){
  const P=G.pack;if(!P)return{error:'没有卡包'};
  const opt=P.opts[idx];
  if(!opt)return{error:'无此选项'};
  const st=recalcStats(G);
  if(opt.kind==='joker'){
    if(G.jokers.length>=st.jokerSlots)return{error:'小丑槽位已满'};
    G.jokers.push({id:opt.id,ed:opt.ed,c:{},uid:'j'+(UID++)});
  }else if(opt.kind==='tarot'||opt.kind==='planet'||opt.kind==='spectral'){
    if(G.consumables.length>=st.consumableSlots)return{error:'消耗牌槽位已满'};
    G.consumables.push({kind:opt.kind,id:opt.id});
  }else{
    addCardToDeck(G,opt.card);
  }
  P.opts[idx]=null;P.left--;
  G.ev=[{t:'packPick'}];
  if(P.left<=0){G.pack=null;return{done:true}}
  return{ok:true};
}
function sellJoker(G,i){
  const j=G.jokers[i];if(!j)return{error:'不存在'};
  const v=sellValueOf(j);
  G.money+=v;
  G.jokers.splice(i,1);
  G.ev=[{t:'sell',v}];
  /* 翠绿树叶:卖小丑解除全场禁用 */
  G.leafCleared=true;
  for(const c of G.hand)c.debuff=bossDebuff(G,c);
  return{ok:true,v};
}
function reorderJoker(G,from,to){
  if(to<0||to>=G.jokers.length)return{error:'位置无效'};
  const[j]=G.jokers.splice(from,1);
  G.jokers.splice(to,0,j);
  return{ok:true};
}
function sellConsumable(G,i){
  const c=G.consumables[i];if(!c)return{error:'不存在'};
  G.consumables.splice(i,1);
  return{ok:true};
}

/* ---------- 消耗牌使用 ---------- */
function useConsumable(G,i,selCards,targetJoker){
  const cs=G.consumables[i];
  if(!cs)return{error:'不存在'};
  const st=recalcStats(G);
  const ev=[];
  const ctx={
    G,sel:selCards||[],target:targetJoker,
    p:(a,b)=>rand(G).next()*b<a,pick:a=>rand(G).pick(a),rand:n=>rand(G).int(n),
    money(n){G.money+=n;ev.push({t:'money',n})},
    enh(cd,t){cd.enh=t;ev.push({t:'enh',uid:cd.uid,enh:t})},
    toSuit(cd,s){cd.suit=s;ev.push({t:'suit',uid:cd.uid,suit:s})},
    destroy(cd){removeCardEverywhere(G,cd);if(cd.rank>10)notifyExt(G,'faceDestroyed');ev.push({t:'destroy',uid:cd.uid})},
    addToDeck(cd){cd.uid=UID++;addCardToDeck(G,cd);ev.push({t:'cardAdded',uid:cd.uid})},
    notifyAdd(){},
    mkTarot(id){if(G.consumables.length<st.consumableSlots){G.consumables.push({kind:'tarot',id:id||rand(G).pick(Object.keys(TAROTS))});ev.push({t:'spawn',kind:'tarot'})}},
    mkPlanet(id){if(G.consumables.length<st.consumableSlots){G.consumables.push({kind:'planet',id:id||rand(G).pick(Object.keys(PLANETS))});ev.push({t:'spawn',kind:'planet'})}},
    mkSpectral(id){if(G.consumables.length<st.consumableSlots){G.consumables.push({kind:'spectral',id:id||rand(G).pick(Object.keys(SPECTRALS))});ev.push({t:'spawn',kind:'spectral'})}},
    mkJoker(rar){const j=mkJokerG(G,rar|| (rand(G).p(0.75)?1:rand(G).p(0.85)?2:3));if(!j)return false;ev.push({t:'spawn',kind:'joker',id:j.id});return true},
    spawnConsumable(spec){const st2=recalcStats(G);if(G.consumables.length<st2.consumableSlots)G.consumables.push(spec)},
    edJoker(j,ed){if(j){j.ed=ed;ev.push({t:'edJoker',ed})}},
    levelUp(h,n){levelUpHand(G,h,n);notifyExt(G,'planetUsed');ev.push({t:'levelUp',hand:h,n})},
    totalSellValue(){return G.jokers.reduce((s,j)=>s+sellValueOf(j),0)},
    toastJoker(j,msg){ev.push({t:'jokerToast',uid:j.uid,msg})},
  };
  let result;
  if(cs.kind==='planet'){
    const h=PLANETS[cs.id].hand;
    levelUpHand(G,h,1);notifyExt(G,'planetUsed');
    ev.push({t:'levelUp',hand:h,n:1});
    result=true;
  }else if(cs.kind==='tarot'){
    const def=TAROTS[cs.id];
    if(def.sel>0&&(!selCards||selCards.length!==def.sel))return{error:'需要选择 '+def.sel+' 张手牌'};
    if(def.target==='joker'&&!targetJoker)return{error:'需要选择一张小丑'};
    if(!def.sel&&!def.target&&selCards&&selCards.length)return{error:'该牌不需要选牌'};
    result=def.use(ctx);
  }else{
    const def=SPECTRALS[cs.id];
    if(def.sel>0&&(!selCards||selCards.length!==def.sel))return{error:'需要选择 '+def.sel+' 张手牌'};
    result=def.use(ctx);
  }
  if(result==='miss')return{refund:true,ev};
  if(result!==true)return{error:'无法使用'};
  G.consumables.splice(i,1);
  if(cs.kind!=='spectral')G.lastConsumable={kind:cs.kind,id:cs.id};
  G.ev=ev;
  return{ok:true,ev};
}

/* ---------- 每回合小丑回合开始触发 ---------- */
function onRoundStartJokers(G){
  for(const j of G.jokers){
    if(j.debuff)continue;
    const d=resolveJoker(G,j);
    if(d&&d.onRoundStart){d.onRoundStart({G,jk:j,c:j.c})}
  }
}

/* ---------- API 出口 ---------- */
function bellForceSelect(G){const f=G.flags&&G.flags.ceruleanBell;if(!f||!G.hand.length)return;G.selected=[G.hand[0].uid]}
function peekTag(G){if(!G.shownTag)G.shownTag=rollTag(G);return G.shownTag}
function startEndless(G){G.phase='select';G.ante++;G.round=0;nextBoss(G);G.blind='small';return{ok:true}}
const Engine={
  peekTag,startEndless,bellForceSelect,bossDebuff,newRun,serialize,deserialize,recalcStats,evaluateHand,handBase,playHand,discardSelected,
  drawCards,startBlind,skipBlind,advanceBlind,nextBoss,rerollBoss,blindTarget,
  cashoutRewards,finishCashout,roundLost,startShop,rerollShop,buyShopItem,buyVoucher,buyPack,
  openPack,pickFromPack,sellJoker,reorderJoker,sellConsumable,useConsumable,
  mkJokerG,addCardToDeck,levelUpHand,mostPlayedHand,fmt,priceOf,shopPrices,sellValueOf,
  makeCard,buildDeck,rollTag,applyTag,onRoundStartJokers,recalcJokerFlags,
};
if(typeof module!=='undefined')module.exports=Engine;
/*__ENGINE_END__*/
