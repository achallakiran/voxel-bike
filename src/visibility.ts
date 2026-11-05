import * as T from 'three';

interface GroupFade {
  amount:number;
  until:number;
  materials:{mesh:T.Mesh;original:T.Material;copy:T.Material}[];
}
interface InstanceFade {
  amount:number;
  until:number;
  batch:T.InstancedMesh;
  index:number;
  original:T.Matrix4;
  proxy:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;
}

export class RiderVisibility {
  private readonly ray=new T.Raycaster();
  private readonly direction=new T.Vector3();
  private readonly point=new T.Vector3();
  private readonly targets: T.Vector3[]=[new T.Vector3(),new T.Vector3()];
  private readonly hiddenMatrix=new T.Matrix4();
  private readonly instances=new Map<T.InstancedMesh,Set<number>>();
  private readonly groups=new Map<T.Object3D,{eligible?: (distance:number)=>boolean; bounds?:T.Box3}>();
  private readonly activeGroups=new Map<T.Object3D,GroupFade>();
  private readonly activeInstances=new Map<T.Mesh,InstanceFade>();
  private readonly fadedInstances=new Map<string,InstanceFade>();
  private clock=0;
  private nextCheck=0;

  addInstances(mesh:T.InstancedMesh|undefined,indices:number[]){
    if(mesh&&indices.length)this.instances.set(mesh,new Set(indices));
  }
  addGroup(object:T.Object3D,eligible?:(distance:number)=>boolean){
    this.groups.set(object,{eligible,bounds:eligible?new T.Box3().setFromObject(object).expandByScalar(0.65):undefined});
  }
  reset(){
    for(const state of this.activeInstances.values())this.restoreInstance(state);
    for(const state of this.activeGroups.values())this.restoreGroup(state);
    this.instances.clear();this.groups.clear();
    this.activeGroups.clear();this.activeInstances.clear();this.fadedInstances.clear();
    this.clock=this.nextCheck=0;
  }
  private restoreInstance(state:InstanceFade){
    state.batch.setMatrixAt(state.index,state.original);
    state.batch.instanceMatrix.needsUpdate=true;
    state.proxy.removeFromParent();
    state.proxy.material.dispose();
  }
  private restoreGroup(state:GroupFade){
    for(const {mesh,original,copy} of state.materials){mesh.material=original;copy.dispose();}
  }
  private touchGroup(object:T.Object3D){
    let state=this.activeGroups.get(object);
    if(!state){
      const materials:GroupFade['materials']=[];
      object.traverse(child=>{
        if(!(child instanceof T.Mesh)||Array.isArray(child.material))return;
        const original=child.material,copy=original.clone();
        copy.transparent=true;copy.depthWrite=false;
        child.material=copy;materials.push({mesh:child,original,copy});
      });
      state={amount:1,until:0,materials};
      this.activeGroups.set(object,state);
    }
    state.until=this.clock+0.18;
  }
  private touchInstance(batch:T.InstancedMesh,index:number){
    const key=batch.id+':'+index;
    let state=this.fadedInstances.get(key);
    if(!state){
      const original=new T.Matrix4();
      batch.getMatrixAt(index,original);
      const material=(batch.material as T.MeshStandardMaterial).clone(),color=new T.Color();
      batch.getColorAt(index,color);
      material.color.multiply(color);
      material.transparent=true;material.depthWrite=false;
      const proxy=new T.Mesh(batch.geometry,material);
      proxy.matrixAutoUpdate=false;proxy.matrix.copy(original);
      batch.add(proxy);proxy.updateWorldMatrix(true,false);
      batch.setMatrixAt(index,this.hiddenMatrix.makeScale(0,0,0));
      batch.instanceMatrix.needsUpdate=true;
      state={batch,index,original,proxy,amount:1,until:0};
      this.activeInstances.set(proxy,state);this.fadedInstances.set(key,state);
    }
    state.until=this.clock+0.18;
  }
  update(camera:T.Camera,rider:T.Object3D,distance:number,dt:number){
    this.clock+=dt;
    if(this.clock>=this.nextCheck){
      this.nextCheck=this.clock+0.05;
      rider.updateWorldMatrix(true,false);
      this.targets[0].set(0.06,1.47,0).applyMatrix4(rider.matrixWorld);
      this.targets[1].set(-0.23,0.94,0).applyMatrix4(rider.matrixWorld);
      for(const target of this.targets){
        this.direction.subVectors(target,camera.position);
        this.ray.far=this.direction.length()-0.30;
        if(this.ray.far<=0)continue;
        this.ray.set(camera.position,this.direction.normalize());
        for(const [batch,indices] of this.instances){
          if(!batch.boundingSphere)continue;
          this.point.copy(batch.boundingSphere.center).applyMatrix4(batch.matrixWorld);
          if(this.ray.ray.distanceSqToPoint(this.point)>batch.boundingSphere.radius**2||
             this.point.distanceTo(camera.position)>this.ray.far+batch.boundingSphere.radius)continue;
          for(const hit of this.ray.intersectObject(batch,false)){
            if(hit.instanceId!==undefined&&indices.has(hit.instanceId)&&
              !this.fadedInstances.has(batch.id+':'+hit.instanceId))this.touchInstance(batch,hit.instanceId);
          }
        }
        for(const [object,{eligible,bounds}] of this.groups){
          if(!object.visible||eligible&&!eligible(distance))continue;
          if(bounds&&!this.ray.ray.intersectsBox(bounds))continue;
          if(!bounds&&this.ray.ray.distanceSqToPoint(object.position)>12)continue;
          object.updateWorldMatrix(true,true);
          if(this.ray.intersectObject(object,true).length)this.touchGroup(object);
        }
        for(const [proxy,state] of this.activeInstances){
          if(this.ray.intersectObject(proxy,false).length)state.until=this.clock+0.18;
        }
      }
    }
    const opacity=(value:number,until:number)=>{
      const target=this.clock<=until?0.18:1;
      return value+(target-value)*(1-Math.exp(-dt*(target<1?27:12)));
    };
    for(const [object,state] of this.activeGroups){
      state.amount=opacity(state.amount,state.until);
      if(this.clock>state.until&&state.amount>0.99){
        this.restoreGroup(state);this.activeGroups.delete(object);
      }else for(const {copy,original} of state.materials)copy.opacity=state.amount*original.opacity;
    }
    for(const [proxy,state] of this.activeInstances){
      state.amount=opacity(state.amount,state.until);
      if(this.clock>state.until&&state.amount>0.99){
        this.restoreInstance(state);this.activeInstances.delete(proxy);
        this.fadedInstances.delete(state.batch.id+':'+state.index);
      }else state.proxy.material.opacity=state.amount;
    }
  }
}
