import {DT,blend,type Race} from './race';
const NS='http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(name:K,attrs:Record<string,string>){
  const element=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,value);
  return element;
}
export class RaceMap {
  private race?:Race;
  private project?:(distance:number,lateral:number)=>{x:number;y:number};
  private dots:SVGCircleElement[]=[];
  private ghost?:SVGCircleElement;
  constructor(private readonly host:HTMLElement){}
  reset(race:Race){
    this.race=race;
    const track=race.track;
    const points=Array.from({length:193},(_,i)=>track.pose(i/192*track.lapLength));
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
    const scale=Math.min(138/Math.max(1,maxX-minX),52/Math.max(1,maxZ-minZ));
    const project=(p:{x:number;z:number})=>({x:80+(p.x-(minX+maxX)/2)*scale,y:35+(p.z-(minZ+maxZ)/2)*scale});
    this.project=(distance,lateral)=>project(track.pose(distance,lateral));
    const outline=points.map(p=>{const q=project(p);return q.x.toFixed(2)+','+q.y.toFixed(2);}).join(' ');
    const map=svg('svg',{viewBox:'0 0 160 70',role:'img','aria-label':'Live circuit positions'});
    map.append(svg('polyline',{points:outline,class:'map-shadow'}),svg('polyline',{points:outline,class:'map-track'}));
    const gate=this.project(0,0);
    map.append(svg('rect',{x:String(gate.x-2.5),y:String(gate.y-2.5),width:'5',height:'5',class:'map-gate'}));
    this.dots=race.colors.slice(0,1+race.rivals.length).map((color,index)=>{
      const dot=svg('circle',{r:index?'3':'4',fill:'#'+color.toString(16).padStart(6,'0'),class:index?'map-rival':'map-player'});
      const title=svg('title',{});title.textContent=index?'Rival '+index:'You';dot.append(title);return dot;
    });
    this.ghost=undefined;
    if(race.ghost){
      this.ghost=svg('circle',{r:'3',class:'map-ghost'});
      const title=svg('title',{});title.textContent='Previous best';this.ghost.append(title);map.append(this.ghost);
    }
    // Draw the player last so the white halo remains visible in a close pack.
    map.append(...this.dots.slice(1),this.dots[0]);
    this.host.replaceChildren(map);
    this.update(1);
  }
  update(alpha:number){
    const race=this.race,project=this.project;if(!race||!project)return;
    const bikes=[race.rider,...race.rivals];
    bikes.forEach((bike,index)=>{
      const previous=race.previous[index];
      const p=project(blend(previous.x,bike.x,alpha),blend(previous.z,bike.z,alpha));
      const dot=this.dots[index];dot.setAttribute('cx',String(p.x));dot.setAttribute('cy',String(p.y));
      const lap=race.mode==='practice'?race.lap:Math.min(race.track.laps,Math.max(1,Math.floor(bike.x/race.track.lapLength)+1));
      const label=(index?'Rival '+index:'You')+' · Lap '+lap;
      if(dot.getAttribute('aria-label')!==label){dot.setAttribute('aria-label',label);dot.firstChild!.textContent=label;}
    });
    const run=race.ghost;
    if(this.ghost&&run){
      const visible=race.time>=0&&race.time<=run.frames[run.frames.length-1][0];
      this.ghost.style.display=visible?'':'none';
      if(visible){
        const i=Math.min(run.frames.length-1,Math.max(0,Math.floor(race.time/(DT*6))));
        const a=run.frames[i],b=run.frames[Math.min(i+1,run.frames.length-1)];
        const t=Math.max(0,Math.min(1,(race.time-a[0])/Math.max(0.001,b[0]-a[0])));
        const p=project(blend(a[1],b[1],t),blend(a[3],b[3],t));
        this.ghost.setAttribute('cx',String(p.x));this.ghost.setAttribute('cy',String(p.y));
      }
    }
  }
}
