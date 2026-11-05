import * as T from 'three';
import { LANES, WIDTH, Track, Race, Bike, blend, clamp, DT } from './race';
const PALETTES = [
  { sky:0x79c1c6, fog:0x9fcbd0, dirt:0xb97449, soil:0x875139, grass:0x646f47, rock:0xa78b65, far:0x749995, trim:0xffd166, sun:0xffdd9d },
  { sky:0x9eaac8, fog:0xb0a9c1, dirt:0x9d704e, soil:0x63525b, grass:0x6d6578, rock:0x8a7886, far:0x7b7e9c, trim:0xffba56, sun:0xffba83 },
  { sky:0x385676, fog:0x55718a, dirt:0x856854, soil:0x564d52, grass:0x4d6258, rock:0x657b80, far:0x466581, trim:0xfbac79, sun:0xbdd9e5 },
];
const cube = new T.BoxGeometry(1,1,1);
const tyre = new T.CylinderGeometry(0.54,0.54,0.33,12).rotateX(Math.PI/2);
const rim = new T.CylinderGeometry(0.34,0.34,0.36,10).rotateX(Math.PI/2);
const circle = new T.CircleGeometry(1,18).rotateX(-Math.PI/2);
const materials = new Map<string,T.MeshStandardMaterial>();
function mat(color: number, ghost: boolean) {
  const key = color + ':' + ghost;
  if (!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({color, roughness:0.87,
    transparent:ghost, opacity:ghost ? 0.29 : 1, depthWrite:!ghost}));
  return materials.get(key)!;
}
function box(parent: T.Object3D, color:number, x:number,y:number,z:number,w:number,h:number,d:number,ghost=false) {
  const m = new T.Mesh(cube,mat(color,ghost));
  m.position.set(x,y,z); m.scale.set(w,h,d); parent.add(m); return m;
}
function bar(parent:T.Object3D, color:number, ax:number,ay:number,bx:number,by:number,z:number,thick:number,depth:number,ghost=false) {
  const m = box(parent,color,(ax+bx)/2,(ay+by)/2,z,Math.hypot(bx-ax,by-ay),thick,depth,ghost);
  m.rotation.z = Math.atan2(by-ay,bx-ax); return m;
}
interface RiderView {
  root:T.Group; body:T.Group; person:T.Group; wheels:T.Group[]; shadow:T.Mesh<T.CircleGeometry,T.MeshBasicMaterial>; fork:T.Mesh;
}
function makeRider(scene:T.Scene,color:number,ghost=false):RiderView {
  const root=new T.Group(),body=new T.Group(),person=new T.Group();
  scene.add(root); root.add(body); body.add(person);
  const ink=0x18242b, silver=0xb2bbc1, white=0xf9f0d4;
  const b=(c:number,x:number,y:number,z:number,w:number,h:number,d:number) => box(body,c,x,y,z,w,h,d,ghost);
  const p=(c:number,x:number,y:number,z:number,w:number,h:number,d:number) => box(person,c,x,y,z,w,h,d,ghost);
  b(ink,-0.25,0.45,0,1.24,0.2,0.56); // seat
  b(color,-0.90,0.35,0,0.86,0.16,0.58).rotation.z=0.18;
  b(color,0.30,0.47,0,0.59,0.36,0.63);
  b(silver,-0.06,-0.04,0,0.7,0.39,0.56);
  b(ink,-0.04,-0.27,0,0.57,0.14,0.57);
  b(silver,-0.82,0.12,0.31,0.79,0.14,0.13).rotation.z=-0.12;
  b(color,0.98,0.30,0,0.89,0.14,0.49).rotation.z=-0.13;
  b(white,0.64,0.53,0,0.16,0.4,0.60).rotation.z=0.25;
  bar(body,silver,-0.94,-0.2,0.14,-0.11,0.18,0.12,0.12,ghost);
  const fork=bar(body,silver,0.89,-0.23,0.50,0.65,0,0.14,0.47,ghost);
  b(ink,0.49,0.69,0,0.16,0.13,0.94);
  for (const z of [-0.33,0.33]) {
    bar(person,ink,-0.38,0.70,0.13,0.46,z,0.25,0.23,ghost);
    bar(person,ink,0.13,0.46,-0.17,0.12,z,0.23,0.23,ghost);
    p(ink,-0.04,0.09,z,0.32,0.19,0.27);
    bar(person,color,-0.11,1.19,0.14,0.91,z,0.20,0.22,ghost);
    bar(person,white,0.14,0.91,0.51,0.72,z,0.16,0.20,ghost);
  }
  p(color,-0.27,0.93,0,0.54,0.59,0.54).rotation.z=-0.38;
  p(white,-0.35,1.11,0,0.34,0.18,0.58).rotation.z=-0.38;
  p(color,0.03,1.46,0,0.56,0.52,0.55);
  p(color,0.12,1.73,0,0.35,0.09,0.47);
  p(ink,0.30,1.49,0,0.20,0.18,0.56);
  p(white,0.38,1.61,0,0.23,0.07,0.55);
  p(color,0.24,1.31,0,0.32,0.13,0.46);
  const wheels=[-0.91,0.89].map(x=>{
    const wheel=new T.Group(); wheel.position.set(x,-0.18,0); body.add(wheel);
    wheel.add(new T.Mesh(tyre,mat(ink,ghost)),new T.Mesh(rim,mat(silver,ghost)));
    for (const z of [-0.19,0.19]) {
      box(wheel,ink,0,0,z,0.61,0.06,0.033,ghost);
      box(wheel,ink,0,0,z,0.06,0.61,0.033,ghost);
      box(wheel,white,0,0,z*1.1,0.13,0.13,0.04,ghost);
    }
    return wheel;
  });
  const shadow=new T.Mesh(circle,new T.MeshBasicMaterial({color:0x231b25,transparent:true,opacity:ghost?0:0.24,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  shadow.scale.set(1.44,1,0.58); scene.add(shadow);
  return {root,body,person,wheels,shadow,fork};
}
type Block = [number,number,number,number,number,number,number];
const decorationMaterial = new T.MeshStandardMaterial({roughness:0.92});
function batch(scene:T.Object3D,blocks:Block[]) {
  if (!blocks.length) return;
  const mesh=new T.InstancedMesh(cube,decorationMaterial,blocks.length);
  const obj=new T.Object3D(), color=new T.Color();
  blocks.forEach(([x,y,z,w,h,d,c],i)=>{
    obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.updateMatrix();
    mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.setHex(c));
  });
  mesh.computeBoundingSphere(); scene.add(mesh);
}
function seeded(seed:number) {return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export class View {
  private scene = new T.Scene();
  private camera = new T.OrthographicCamera();
  private renderer: T.WebGLRenderer;
  private world=new T.Group();
  private riders:RiderView[]=[];
  private dust:T.InstancedMesh;
  private particles:{x:number;y:number;z:number;life:number;size:number;color:number}[]=[];
  private track!:Track;
  private targetX=0;
  private targetY=0;
  private elapsed=0;
  private lastDust=0;
  private width=0;
  private height=0;
  quality=true;
  constructor(canvas:HTMLCanvasElement) {
    this.renderer=new T.WebGLRenderer({canvas, antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.scene.add(new T.HemisphereLight(0xffecd0,0x8b7f87,2.05));
    const sun=new T.DirectionalLight(0xffead3,2.0); sun.position.set(-12,18,8); this.scene.add(sun);
    this.scene.add(this.world);
    this.dust=new T.InstancedMesh(cube,new T.MeshStandardMaterial({roughness:1}),84);
    this.dust.count=0; this.dust.frustumCulled=false; this.scene.add(this.dust);
  }
  reset(track:Track) {
    this.track=track;
    this.world.traverse(o=>{if (o instanceof T.InstancedMesh) o.dispose(); else if(o instanceof T.Mesh && o.geometry !== cube) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }});
    this.world.clear();
    for(const r of this.riders) {
      this.scene.remove(r.root,r.shadow);
      r.shadow.material.dispose();
    }
    this.riders=[];
    this.particles=[];this.targetX=5;this.targetY=0;
    const palette=PALETTES[track.course.theme];
    this.scene.background=new T.Color(palette.sky);this.scene.fog=new T.Fog(palette.fog,30,125);
    const rng=seeded(632+track.course.theme);
    const meshMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
    for(let start=-30;start<track.end+44;start+=38){
      const stop=Math.min(start+38,track.end+44);
      const vertices:number[]=[], colors:number[]=[], blocks:Block[]=[];
      const color=new T.Color();
      const block=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>blocks.push([x,y,z,w,h,d,c]);
      const breaks=[start,stop];
      for(let x=start+1.3;x<stop;x+=1.3) breaks.push(x);
      for(const s of track.segments) {
        const shapeLength = s.piece==='straight'||s.piece==='mud'||s.piece==='cool' ? 1 : 6;
        const points=[s.x+1.4,s.end-1.4];
        for(let i=0;i<=shapeLength;i++) points.push(blend(s.x,s.end,i/shapeLength));
        breaks.push(...points.filter(x=>x>start&&x<stop));
      }
      breaks.sort((a,b)=>a-b);
      function vertex(x:number,y:number,z:number) { vertices.push(x,y,z);colors.push(color.r,color.g,color.b); }
      for(let i=0;i<breaks.length-1;i++){
        const a=breaks[i],b=breaks[i+1];
        if(b-a<0.0001) continue;
        for(let j=0;j<8;j++){
          const z0=-WIDTH/2+j*1.2,z1=z0+1.2,z=(z0+z1)/2;
          const surface=track.surface((a+b)/2,z);
          color.setHex(surface==='mud'?0x594035:surface==='cool'?0x30877e:palette.dirt)
            .multiplyScalar((j%2?1:0.97)*(0.92+rng()*0.14));
          vertex(a,track.height(a,z0),z0);vertex(a,track.height(a,z1),z1);vertex(b,track.height(b,z0),z0);
          vertex(a,track.height(a,z1),z1);vertex(b,track.height(b,z1),z1);vertex(b,track.height(b,z0),z0);
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
      this.world.add(new T.Mesh(g,meshMaterial.clone()));
      block((start+stop)/2,-1.14,1.5,stop-start,0.85,41,palette.grass);
      block((start+stop)/2,-1.53,-22,stop-start,0.85,9,palette.far);
      for(let x=start;x<stop;x+=1.9){
        for(const sign of [-1,1]){
          const top=track.height(x,sign*4.8);
          block(x,top/2-0.49,sign*5.05,1.94,top+0.99,0.62,palette.soil);
          block(x,top*0.31-0.5,sign*5.52,1.97,top*0.62+0.96,0.34,palette.rock);
          block(x,top+0.035,sign*4.81,1.2,0.085,0.18,Math.floor(x/1.9)%2?palette.trim:0x5b403b);
        }
        for(let l=0;l<4;l++){
          const z=LANES[l];
          const s=track.surface(x,z);
          if(s==='cool'){
            for(const dir of [-1,1]) {
              const mark:[number,number,number,number,number,number,number]=[x,0.045,z+dir*0.21,0.48,0.04,0.17,0xa3ffda];
              blocks.push(mark,[x+0.26,0.045,z+dir*0.08,0.19,0.04,0.18,0xa3ffda]);
            }
          } else if(s==='mud'){
            block(x+rng()*0.6,0.022,z+(rng()-0.5)*1.6,0.55+rng()*0.8,0.047,0.13+rng()*0.2,0x4a352e);
          } else if(rng()<0.34) {
            const dz=(rng()-0.5)*1.7;
            block(x,track.height(x,z+dz)+0.017,z+dz,0.23+rng()*0.55,0.042,0.1,0xa26a49);
          }
        }
      }
      for(let x=start+1;x<stop;x+=3.5){
        block(x,-0.04,-6.8,0.14,1.36,0.16,0x392f32);
        block(x+1.7,0.35,-6.8,3.45,0.15,0.15,0xe9cf9d);
        block(x+1.7,0.01,-6.8,3.45,0.1,0.13,palette.trim);
        if(rng()<0.65) {
          const z=6.1+rng()*4.8;
          block(x,-0.63,z,0.35+rng()*0.68,0.2+rng()*0.37,0.45+rng()*0.45,palette.rock);
          for(let j=0;j<3;j++)block(x+0.42+j*0.13,-0.57+j*0.045,z+0.4-j*0.11,0.10,0.27+j*0.065,0.11,0x869064);
        }
      }
      for(let x=start+4;x<stop;x+=9){
        const high=5+rng()*8;
        for(let layer=0;layer<4;layer++){
          block(x+rng()*4,high*layer*0.25-1.0,-27-rng()*5,10+rng()*10-layer,high*0.53,10-layer*0.7,palette.far);
          if(track.course.theme===1) block(x+1,layer*1.13-0.3,-15-layer*1.5,9+rng()*3-layer,1.24,3.3,palette.rock);
        }
        if(track.course.theme===0 && (x<10 || Math.floor(x/28)%3!==0)){
          for(let row=0;row<4;row++){
            block(x,row*0.65-0.28,-11-row*0.85,8.9,0.63+row*0.31,0.95, row%2?0x96665a:0xb5846d);
            for(let j=0;j<10;j++){
              if(rng()<0.27) continue;
              const shirt=[0xf2c15f,0xbc5950,0x427b83,0xebd9b9,0x3c4b59][Math.floor(rng()*5)];
              block(x-4+j*0.87,row*0.8+0.07,-11-row*0.85,0.39,0.48,0.42,shirt);
              block(x-4+j*0.87,row*0.8+0.39,-11-row*0.85,0.24,0.25,0.24,rng()>0.45?0xcf9571:0x845948);
            }
          }
        }
        if(track.course.theme===2){
          const tent=[0xa05265,0xe6a667,0x467789][Math.floor(rng()*3)];
          block(x,0.51,-14,5.4,2.25,3.6,tent);
          for(let j=0;j<4;j++) block(x,1.68+j*0.33,-14,5.6-j*0.94,0.38,3.85-j*0.7,tent);
          block(x,0.16,-12.16,1.6,1.63,0.14,0xffd386);
        }
        if(track.course.theme===0 && rng()<0.64){
          const flag=[0xe99359,0xf9cb72,0x76b9a6][Math.floor(rng()*3)];
          block(x,2.65,-8.35,0.105,5.45,0.1,0x5c6057);
          for(let j=0;j<3;j++)block(x+0.29+j*0.31,4.86+j*0.035,-8.35,0.34,0.74-j*0.19,0.105,flag);
        }
        if(rng()<0.42){
          block(x,1.96,-8.25,0.19,5.5,0.2,0x374754);
          block(x,4.73,-8.25,2,0.25,0.44,0x3c4b55);
          for(let j=-1;j<=1;j++)block(x+j*0.57,4.69,-7.98,0.35,0.16,0.1,palette.sun);
        }
        if(rng()<0.64){
          const z=-22-rng()*7;
          block(x,0.78,z,0.34,2.7,0.44,0x694d47);
          for(let j=0;j<4;j++)block(x,1.65+j*0.56,z,3.2-j*0.62,0.59,2.95-j*0.5, j%2?0x566e58:0x63806b);
        }
      }
      batch(this.world,blocks);
    }
    meshMaterial.dispose();
    this.banner(9,0,'VOXEL BIKES',palette.trim);
    this.banner(track.end,0,'FINISH',palette.trim);
    for(let x=66;x<track.end;x+=95) this.sign(x,x%2?'MX / 04':'DIRT CLUB',palette.trim);
    const cloudBlocks:Block[]=[];
    for(let x=-50;x<track.end+80;x+=33) {
      const y=10+rng()*8, z=-39-rng()*21;
      for(let i=0;i<6;i++)cloudBlocks.push([x+i*2.3,y+rng()*1.6,z+rng()*4,3+rng()*5,0.65+rng()*1.05,3+rng()*5,track.course.theme===2?0x8398aa:0xe4d9c6]);
    }
    batch(this.world,cloudBlocks);
  }
  private label(text:string,accent:number) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#17242c';ctx.fillRect(0,0,512,96);
    ctx.fillStyle='#'+accent.toString(16).padStart(6,'0');ctx.fillRect(0,0,512,7);ctx.fillRect(0,89,512,7);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)if((i+j)%2===0){ctx.fillRect(20+i*9,30+j*9,9,9);ctx.fillRect(456+i*9,30+j*9,9,9);}
    ctx.font='900 49px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff4d6';ctx.fillText(text,256,49,365);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    return new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
  }
  private banner(x:number,y:number,text:string,accent:number) {
    const blocks:Block[]=[];
    for(const z of [-5.4,5.4]) {
      for(let j=0;j<6;j++)blocks.push([x,y+0.32+j*0.64,z,0.39,0.64,0.42,j%2?0x23333b:accent]);
    }
    blocks.push([x,y+3.78,0,0.33,0.46,11.2,0x1e2a30]);
    batch(this.world,blocks);
    const label=new T.Mesh(new T.PlaneGeometry(8.5,1.6),this.label(text,accent));
    label.rotation.y=Math.PI/2;label.position.set(x-0.22,y+4.05,0);
    // A second board faces the side-on race camera.
    const side=new T.Mesh(new T.PlaneGeometry(4.8,0.9),label.material.clone());
    side.position.set(x,y+4.05,5.43);
    this.world.add(label,side);
    if(text==='FINISH'){
      const line:Block[]=[];
      for(let i=0;i<16;i++)for(let j=0;j<2;j++)line.push([x+j*0.34,0.018,-4.5+i*0.6,0.34,0.038,0.60,(i+j)%2?0x303235:0xf3e1be]);
      batch(this.world,line);
    }
  }
  private sign(x:number,text:string,accent:number){
    const label=new T.Mesh(new T.PlaneGeometry(4.3,0.8),this.label(text,accent));
    label.position.set(x,0.92,-7.1);this.world.add(label);
  }
  frame(dt:number,race:Race|undefined, attract:boolean) {
    const canvas=this.renderer.domElement;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const pixelRatio=Math.min(this.quality?1.65:1,devicePixelRatio);
    if(w!==this.width||h!==this.height||pixelRatio!==this.renderer.getPixelRatio()){
      this.width=w;this.height=h;this.renderer.setPixelRatio(pixelRatio);this.renderer.setSize(w,h,false);
      const width=Math.max(29,17*w/h),height=width*h/w;
      this.camera.left=-width/2;this.camera.right=width/2;
      this.camera.top=height/2;this.camera.bottom=-height/2;
      this.camera.near=0.1;this.camera.far=180;this.camera.updateProjectionMatrix();
    }
    this.elapsed+=dt;
    let bikes:Bike[];
    if(race)bikes=[race.rider,...race.rivals];
    else{
      const demoX=attract?7+Math.sin(this.elapsed*0.38)*1.35:8;
      bikes=[{x:demoX,y:0.72,z:1.2,pitch:0.025*Math.sin(this.elapsed*3),spin:0,crash:0,air:false,impact:0,speed:0,lane:2,vy:0,heat:0,hot:false,finish:0,recovering:0}];
    }
    const r=bikes[0];
    const n=bikes.length;
    while(this.riders.length<n) this.riders.push(makeRider(this.scene,[0xef694b,0x56bcb6,0xffc35d,0x8c91e8][this.riders.length]));
    const ghost=race?.ghost;
    if(ghost&&this.riders.length===n)this.riders.push(makeRider(this.scene,0xbafcf2,true));
    const showGhost=ghost && race.time>=0 && race.time<=ghost.time;
    if(showGhost){
      const i=clamp(Math.floor(race.time/(DT*6)),0,ghost.frames.length-1);
      const a=ghost.frames[i],b=ghost.frames[Math.min(i+1,ghost.frames.length-1)];
      const t=clamp((race.time-a[0])/Math.max(0.001,b[0]-a[0]),0,1);
      bikes.push({...r,x:blend(a[1],b[1],t),y:blend(a[2],b[2],t),z:blend(a[3],b[3],t),
        pitch:blend(a[4],b[4],t),spin:blend(a[5],b[5],t),impact:0,crash:0});
    }
    this.riders.forEach((view,i)=>{
      const bike=bikes[i];
      view.root.visible=!!bike;
      view.shadow.visible=!!bike&&i<n;
      if(!bike)return;
      const ground=this.track.height(bike.x,bike.z);
      view.root.position.set(bike.x,bike.y,bike.z);
      view.body.rotation.z=bike.crash?bike.pitch-(1-bike.crash/1.04)*1.15:bike.pitch;
      view.body.rotation.x=bike.crash?Math.sin((1-bike.crash/1.04)*Math.PI*0.75)*1.4:0;
      view.person.rotation.z=-bike.impact*0.22+Math.sin(this.elapsed*18)*Math.min(0.025,bike.speed/900);
      view.person.position.y=-bike.impact*0.15;
      view.fork.scale.y=0.14-bike.impact*0.026;
      view.wheels.forEach(w=>{w.rotation.z=bike.spin;w.position.y=-0.18+bike.impact*0.08;});
      view.shadow.position.set(bike.x,ground+0.029,bike.z);
      (view.shadow.material as T.MeshBasicMaterial).opacity=clamp(0.26-(bike.y-ground-0.72)*0.054,0.06,0.28);
    });
    if(race&&race.time>0&&!race.done&&this.elapsed-this.lastDust>0.034){
      this.lastDust=this.elapsed;
      for(const bike of bikes.slice(0,n)){
        if(bike.air||bike.speed<4||this.particles.length>=84)continue;
        const mud=this.track.surface(bike.x,bike.z)==='mud';
        this.particles.push({x:bike.x-0.92,y:bike.y-0.5,z:bike.z+(Math.random()-0.5)*0.49,life:0.45,size:0.12+Math.random()*0.18,color:mud?0x785847:0xcd9b73});
      }
    }
    this.particles=this.particles.filter(p=>p.life>0);
    this.dust.count=this.particles.length;
    const obj=new T.Object3D(),color=new T.Color();
    this.particles.forEach((p,i)=>{
      p.life-=dt;p.y+=dt*0.58;p.x-=dt*1.5;obj.position.set(p.x,p.y,p.z);
      obj.scale.setScalar(p.size*clamp(p.life*4,0.1,1));obj.rotation.y=i*0.9;obj.updateMatrix();
      this.dust.setMatrixAt(i,obj.matrix);this.dust.setColorAt(i,color.setHex(p.color));
    });
    this.dust.instanceMatrix.needsUpdate=true;
    if(this.dust.instanceColor)this.dust.instanceColor.needsUpdate=true;
    const cameraLead=attract?-3.6:6.5+r.speed*0.065;
    this.targetX=blend(this.targetX,r.x+cameraLead,1-Math.exp(-dt*(attract?3:13)));
    this.targetY=blend(this.targetY,this.track.height(r.x,r.z)*0.33,1-Math.exp(-dt*4.2));
    this.camera.position.set(this.targetX-6.8,this.targetY+11.0,24.4);
    this.camera.lookAt(this.targetX,this.targetY+1.85,-1.8);
    this.renderer.render(this.scene,this.camera);
  }
}
