export const BOUNDS={minX:-5.65,maxX:5.65,minZ:-4.15,maxZ:4.15};
export const OBSTACLES=[{x:3.5,z:-3.05,w:2.8,d:1.05},{x:-.35,z:.15,w:1.35,d:1.2},{x:-4.95,z:3.2,w:.65,d:.65},{x:5.05,z:-3.65,w:.6,d:.6}];
export const PICKUP={x:-3.9,z:-2.35},ASSEMBLY={x:3.5,z:-1.9};
export function isFree(x,z,padding=.34){return x>=BOUNDS.minX&&x<=BOUNDS.maxX&&z>=BOUNDS.minZ&&z<=BOUNDS.maxZ&&!OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+padding&&Math.abs(z-o.z)<o.d/2+padding)}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function findPath(start,end){
 if(!isFree(end.x,end.z))return null;
 const step=.25,key=(x,z)=>`${x},${z}`,grid=p=>({x:Math.round(p.x/step),z:Math.round(p.z/step)}),a=grid(start),b=grid(end);
 const open=[{...a,g:0,f:0}],seen=new Map([[key(a.x,a.z),0]]),parents=new Map();let last=null;
 while(open.length){open.sort((a,b)=>a.f-b.f);let n=open.shift();if(n.x===b.x&&n.z===b.z){last=n;break}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
 if(!dx&&!dz)continue;let x=n.x+dx,z=n.z+dz;if(!isFree(x*step,z*step))continue;
 if(dx&&dz&&(!isFree((n.x+dx)*step,n.z*step)||!isFree(n.x*step,(n.z+dz)*step)))continue;
 let g=n.g+Math.hypot(dx,dz),k=key(x,z);if(seen.has(k)&&seen.get(k)<=g)continue;seen.set(k,g);parents.set(k,n);open.push({x,z,g,f:g+Math.hypot(b.x-x,b.z-z)});
 }}
 if(!last)return null;const route=[];while(last.x!==a.x||last.z!==a.z){route.unshift({x:last.x*step,z:last.z*step});last=parents.get(key(last.x,last.z))}route.push({...end});return route;
}
export function createSimulation(){return {robot:{x:-2.7,z:2.3,angle:Math.PI-.35},box:{...PICKUP},carrying:false,built:false,queue:[],completed:[],paused:false,mode:'guide',activeTime:0,nextId:1};}
export function addTask(s,type,target,append=false){
 let cargo=s.carrying;
 if(append)for(const t of s.queue){if(t.type==='pickup')cargo=true;if(t.type==='build'||t.type==='drop')cargo=false;}
 if(type==='pickup'&&cargo)return 'The robot is already carrying a box.';
 if(type==='build'&&!cargo)return 'Pick up a box before assembling it.';
 if(type==='pickup'&&!s.box)return 'No box to pick up. Reset to start again.';
 const destination=target|| (type==='pickup'?s.box:ASSEMBLY);
 const from=append&&s.queue.length?s.queue.at(-1).target:s.robot;
 if(!findPath(from,destination))return 'That spot is blocked. Choose open floor.';
 if(!append){s.queue=[];s.activeTime=0;}
 s.queue.push({id:s.nextId++,type,target:{...destination},path:null,phase:'travel',progress:0});s.paused=false;return null;
}
export function update(s,dt,input={x:0,z:0}){
 if(s.mode==='joystick'&&(input.x||input.z)){
 s.paused=!!s.queue.length;s.activeTime=0;for(const task of s.queue){task.path=null;task.phase='travel';task.progress=0;}
 const length=Math.hypot(input.x,input.z),speed=1.75*dt/Math.max(1,length),dx=input.x*speed,dz=input.z*speed;
 if(isFree(s.robot.x+dx,s.robot.z))s.robot.x+=dx;if(isFree(s.robot.x,s.robot.z+dz))s.robot.z+=dz;
 s.robot.angle=Math.atan2(input.x,input.z);return;
 }
 if(s.paused||!s.queue.length)return;
 let task=s.queue[0];if(!task.path)task.path=findPath(s.robot,task.target);
 if(!task.path){s.queue.shift();s.activeTime=0;return;}
 if(task.phase==='travel'){
 let budget=dt*1.65;while(task.path.length&&budget>0){let point=task.path[0],d=distance(s.robot,point);if(d>.001)s.robot.angle=Math.atan2(point.x-s.robot.x,point.z-s.robot.z);if(d<=budget){s.robot.x=point.x;s.robot.z=point.z;task.path.shift();budget-=d;}else{s.robot.x+=(point.x-s.robot.x)/d*budget;s.robot.z+=(point.z-s.robot.z)/d*budget;budget=0;}}
 if(!task.path.length){task.phase='work';s.activeTime=0;}
 }else{
 s.activeTime+=dt;const duration=task.type==='build'?3.6:task.type==='pickup'?.7:.12;task.progress=Math.min(1,s.activeTime/duration);
 if(task.progress>=1){if(task.type==='pickup'&&s.box){s.carrying=true;s.box=null;}if(task.type==='build'&&s.carrying){s.carrying=false;s.built=true;}if(task.type==='drop'){s.box={...task.target};s.carrying=false;}s.completed.push(task);s.queue.shift();s.activeTime=0;}
 }
}
export function pickup(s){if(s.carrying)return 'The robot is already carrying a box.';if(!s.box||distance(s.robot,s.box)>.9)return 'Move closer to the box to pick it up.';s.carrying=true;s.box=null;return null;}
export function drop(s){if(!s.carrying)return 'Pick up a box first.';if(distance(s.robot,ASSEMBLY)<1){s.queue=[];s.paused=false;return addTask(s,'build',null);}const target={x:s.robot.x+Math.sin(s.robot.angle)*.65,z:s.robot.z+Math.cos(s.robot.angle)*.65};if(!isFree(target.x,target.z,.2))return 'Move away from the obstacle to put the box down.';s.box=target;s.carrying=false;return null;}
