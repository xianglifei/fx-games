/* ============================================================
   音效引擎:WebAudio 程序化合成,无外部素材
   ============================================================ */
'use strict';
const Snd=(()=>{
  let ctx=null,master=null,muted=false;
  function ensure(){
    if(ctx)return true;
    try{
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);
    }catch(e){return false}
    return true;
  }
  function tone({f=440,f2,dur=.1,type='sine',vol=.5,delay=0,attack=.005,slide}={}){
    if(muted||!ensure())return;
    const t0=ctx.currentTime+delay;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t0);
    if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(1,f2),t0+dur);
    if(slide)o.frequency.linearRampToValueAtTime(slide,t0+dur);
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(vol,t0+attack);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    o.connect(g);g.connect(master);
    o.start(t0);o.stop(t0+dur+.02);
  }
  function noise({dur=.08,vol=.3,delay=0,hp=800,lp=6000}={}){
    if(muted||!ensure())return;
    const t0=ctx.currentTime+delay;
    const len=Math.max(1,Math.floor(ctx.sampleRate*dur));
    const buf=ctx.createBuffer(1,len,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const src=ctx.createBufferSource();src.buffer=buf;
    const g=ctx.createGain();g.gain.value=vol;
    const f1=ctx.createBiquadFilter();f1.type='highpass';f1.frequency.value=hp;
    const f2=ctx.createBiquadFilter();f2.type='lowpass';f2.frequency.value=lp;
    src.connect(f1);f1.connect(f2);f2.connect(g);g.connect(master);
    src.start(t0);
  }
  const api={
    setMuted(m){muted=m;if(master)master.gain.value=m?0:.5},
    isMuted:()=>muted,
    unlock(){ensure();if(ctx&&ctx.state==='suspended')ctx.resume()},
    click(){tone({f:880,f2:660,dur:.05,type:'triangle',vol:.25})},
    select(){tone({f:520,f2:780,dur:.06,type:'square',vol:.18})},
    deselect(){tone({f:780,f2:520,dur:.06,type:'square',vol:.15})},
    deal(){noise({dur:.07,vol:.22,hp:1200,lp:7000});tone({f:300,f2:180,dur:.06,type:'triangle',vol:.15})},
    flip(){noise({dur:.05,vol:.18,hp:2000,lp:9000})},
    chips(n=0){tone({f:620+((n*37)%180),f2:900+((n*53)%220),dur:.05,type:'square',vol:.16})},
    mult(){tone({f:180,f2:120,dur:.12,type:'sawtooth',vol:.28});tone({f:240,dur:.08,type:'square',vol:.14,delay:.02})},
    xmult(){tone({f:520,f2:1040,dur:.18,type:'sawtooth',vol:.3});tone({f:780,f2:1560,dur:.22,type:'triangle',vol:.22,delay:.05})},
    money(){tone({f:1046,dur:.09,type:'triangle',vol:.25});tone({f:1568,dur:.14,type:'triangle',vol:.2,delay:.07})},
    joker(){tone({f:392,f2:523,dur:.12,type:'triangle',vol:.24})},
    cash(){[523,659,784,1046].forEach((f,i)=>tone({f,dur:.12,type:'triangle',vol:.24,delay:i*.07}))},
    win(){[523,659,784,1046,1318,1568].forEach((f,i)=>tone({f,dur:.22,type:'triangle',vol:.26,delay:i*.1}));[261,329,392].forEach(f=>tone({f,dur:.5,type:'sine',vol:.16,delay:.6}))},
    lose(){[392,311,262,196].forEach((f,i)=>tone({f,dur:.3,type:'sawtooth',vol:.2,delay:i*.16}))},
    error(){tone({f:160,f2:110,dur:.16,type:'square',vol:.25})},
    reroll(){noise({dur:.12,vol:.25,hp:600,lp:5000});tone({f:700,f2:400,dur:.1,type:'triangle',vol:.18})},
    boss(){tone({f:110,dur:.4,type:'sawtooth',vol:.3});tone({f:82,dur:.5,type:'sawtooth',vol:.24,delay:.12})},
    blindWin(){[440,554,659].forEach((f,i)=>tone({f,dur:.18,type:'triangle',vol:.25,delay:i*.08}))},
    pack(){noise({dur:.15,vol:.2,hp:400,lp:3000});tone({f:660,f2:990,dur:.14,type:'triangle',vol:.2,delay:.05})},
    destroy(){noise({dur:.2,vol:.3,hp:200,lp:1800});tone({f:200,f2:60,dur:.25,type:'sawtooth',vol:.22})},
    heart(){tone({f:90,dur:.18,type:'sine',vol:.4});tone({f:70,dur:.22,type:'sine',vol:.3,delay:.14})},
  };
  return api;
})();
