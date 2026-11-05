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

export async function playStudioLogo(host:HTMLElement,onComplete:()=>void){
  const badge=new Image();
  badge.alt='ADA Studios logo';
  badge.src=STUDIO_BADGE;
  try{await badge.decode();}catch{onComplete();return;}

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
  let age=0,previous=performance.now(),nextArc=0;
  function frame(now:number){
    const dt=Math.min(0.05,Math.max(0,(now-previous)/1000));
    previous=now;
    if(document.hidden||!display.getClientRects().length){requestAnimationFrame(frame);return;}
    age+=dt;
    if(age>=duration){display.remove();onComplete();return;}
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
