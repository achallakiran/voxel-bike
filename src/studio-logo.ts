import {STUDIO_BADGE} from './studio-badge';

type Point=[number,number];
type Arc={points:Point[]; life:number; width:number};

function lightning(x:number,y:number,endX:number,endY:number):Arc {
  const dx=endX-x,dy=endY-y;
  const points:Point[]=[[x,y]];
  for(let i=1;i<9;i++){
    const t=i/9, offset=(Math.random()-0.5)*0.28;
    points.push([x+dx*t-dy*offset,y+dy*t+dx*offset]);
  }
  points.push([endX,endY]);
  return {points,life:0.09+Math.random()*0.07,width:1+Math.random()*1.8};
}

function studioAudio(){
  try{
    const Audio=window.AudioContext??(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Audio)return;
    const context=new Audio();
    if(context.state==='suspended')void context.resume().catch(()=>{});
    const noise=context.createBuffer(1,Math.ceil(context.sampleRate*1.25),context.sampleRate);
    const data=noise.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    function envelope(at:number,attack:number,duration:number,peak:number){
      const gain=context.createGain();
      gain.gain.setValueAtTime(0.001,at);
      gain.gain.exponentialRampToValueAtTime(peak,at+attack);
      gain.gain.exponentialRampToValueAtTime(0.001,at+duration);
      gain.connect(context.destination);
      return gain;
    }
    function burst(at:number,duration:number,from:number,to:number,peak:number,attack=0.006){
      const source=context.createBufferSource(), filter=context.createBiquadFilter();
      source.buffer=noise;
      filter.type='bandpass';filter.Q.value=0.85;
      filter.frequency.setValueAtTime(from,at);
      filter.frequency.exponentialRampToValueAtTime(to,at+duration);
      source.connect(filter).connect(envelope(at,attack,duration,peak));
      source.start(at,0,duration);
    }
    function sweep(at:number,duration:number,from:number,to:number,peak:number,type:OscillatorType){
      const oscillator=context.createOscillator();
      oscillator.type=type;
      oscillator.frequency.setValueAtTime(from,at);
      oscillator.frequency.exponentialRampToValueAtTime(to,at+duration);
      oscillator.connect(envelope(at,0.018,duration,peak));
      oscillator.start(at);oscillator.stop(at+duration);
    }
    return {
      zap(power:number,thunder:boolean){
        if(context.state!=='running')return;
        const now=context.currentTime;
        for(let i=0;i<3;i++)burst(now+i*0.034,0.055,4100-i*470,1520,0.22*power);
        sweep(now,0.17,160,72,0.045*power,'sawtooth');
        if(thunder){
          burst(now,0.12,4100,1750,0.30);
          burst(now+0.045,0.96,780,100,0.46,0.06);
          sweep(now+0.025,0.77,105,32,0.23,'sine');
        }
      },
      close(){void context.close().catch(()=>{});}
    };
  }catch{ /* The badge still plays if audio is unavailable. */ }
}

export async function playStudioLogo(host:HTMLElement,onComplete:()=>void,soundEnabled=true){
  // Construct and resume audio during the user's tap or key press.
  const sound=soundEnabled?studioAudio():undefined;
  const badge=new Image();
  badge.alt='ADA Studios logo';
  badge.src=STUDIO_BADGE;
  try{await badge.decode();}catch{sound?.close();onComplete();return;}

  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const display=reduced||!context?badge:canvas;
  display.className='studio-logo';
  if(display===canvas){
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label',badge.alt);
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;background:#000;pointer-events:none';
  }else{
    badge.style.cssText='position:fixed;left:50%;top:50%;width:72vmin;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none';
  }
  host.append(display);
  const duration=reduced||!context?1.8:3.6;
  const arcs:Arc[]=[];
  let age=0,previous=performance.now(),nextArc=0,nextZap=0.08,closingThunder=false;
  function frame(now:number){
    const dt=Math.min(0.05,Math.max(0,(now-previous)/1000));
    previous=now;
    if(document.hidden||!display.getClientRects().length){requestAnimationFrame(frame);return;}
    age+=dt;
    if(age>=duration){display.remove();sound?.close();onComplete();return;}
    if(age>=nextZap){
      const surge=age<0.8||age>duration-0.65;
      sound?.zap(surge?1:0.46,nextZap===0.08);
      nextZap=age+(reduced?duration:surge?0.28:0.70);
    }
    if(!closingThunder&&age>=2.52){closingThunder=true;sound?.zap(0.9,true);}
    if(display===canvas&&context){
      const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      }
      context.setTransform(dpr,0,0,dpr,0,0);
      context.fillStyle='#000';context.fillRect(0,0,w,h);
      const x=w/2,y=h/2,r=Math.min(w,h)*0.36;
      const power=Math.min(1,age/0.80,(duration-age)/0.62);
      const shake=(1-power)*Math.min(13,r*0.08);
      const bx=x+Math.sin(age*83)*shake,by=y+Math.cos(age*97)*shake*0.55;
      context.save();
      context.globalAlpha=power;
      context.beginPath();context.arc(bx,by,r,0,Math.PI*2);context.clip();
      context.drawImage(badge,bx-r,by-r,r*2,r*2);
      context.restore();
      if(age>=nextArc){
        nextArc=age+(power===1?0.24:0.085);
        const angle=Math.random()*Math.PI*2, end=angle+(Math.random()-0.5)*1.65;
        const reach=r*(power===1?1.14:1.42);
        arcs.push(lightning(bx+Math.cos(angle)*r,by+Math.sin(angle)*r,
          bx+Math.cos(end)*reach,by+Math.sin(end)*reach));
      }
      context.save();
      context.globalCompositeOperation='lighter';
      context.lineJoin='round';
      for(let i=arcs.length-1;i>=0;i--){
        const arc=arcs[i];
        arc.life-=dt;
        if(arc.life<=0){arcs.splice(i,1);continue;}
        context.globalAlpha=Math.min(0.85,arc.life*7);
        context.beginPath();context.moveTo(...arc.points[0]);
        for(const point of arc.points.slice(1))context.lineTo(...point);
        context.strokeStyle='#294c84';context.lineWidth=arc.width*3;context.stroke();
        context.strokeStyle='#c7e6ff';context.lineWidth=arc.width;context.stroke();
      }
      context.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
