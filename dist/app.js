import {VoiceRecognition} from './voice-recognition.js';
import {executeVoiceTranscript} from './voice-commands.js';
import * as THREE from './vendor/three.module.js';
import {ChaseRig,screenToWorld,wallBlocksRobot} from './camera-rig.js';
import {createSimulation,addTask,update,pickup,drop,findPath,OBSTACLES,ASSEMBLY,PICKUP} from './simulation.js';
const $=id=>document.getElementById(id);
let sim=createSimulation(),view='third',selected=true,noticeTimer,joystickPointer=null,joy={x:0,z:0},keys=new Set(),lastQueue='',lastState='',pointerStart=null;
const scene=new THREE.Scene();scene.background=new THREE.Color('#f2f2f2');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor('#f2f2f2');$('viewport').appendChild(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Interactive robot room. Click open floor to move. Use station buttons to pick up and assemble.');
const chase=new ChaseRig();chase.reset(sim.robot);
const topCamera=new THREE.OrthographicCamera(-9,9,7,-7,.1,100);topCamera.position.set(0,20,.001);topCamera.lookAt(0,0,0);
let camera=chase.camera,manualMovingUntil=0,labelHoldUntil=0;
const hoveredLabels=new Set();
const occlusionRay=new THREE.Raycaster(),fadedMeshes=new Set();
scene.add(new THREE.HemisphereLight(0xffffff,0xcacaca,1.8));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,13,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11,near:.1,far:40});sun.shadow.normalBias=.03;sun.shadow.bias=-.0001;sun.shadow.radius=5;scene.add(sun);
const materials={};function mat(color,roughness=.85){return materials[color]??=new THREE.MeshStandardMaterial({color,roughness});}
function box(w,h,d,color,x,y,z,parent=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(r1,r2,h,color,x,y,z,parent=scene,segments=32){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function rounded(w,h,d,r,color,x,y,z,parent=scene){const s=new THREE.Shape();const a=-w/2,b=-d/2;s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+d-r);s.quadraticCurveTo(a+w,b+d,a+w-r,b+d);s.lineTo(a+r,b+d);s.quadraticCurveTo(a,b+d,a,b+d-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.035});g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,mat(color));m.position.set(x,y-h/2,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const floor=box(12,.22,9,'#dedede',0,-.14,0);floor.userData.type='floor';
box(12.18,.12,9.18,'#c9c9c9',0,-.30,0);
const wallHeight=3.2;
const walls=[
 {surfaces:[box(12.1,wallHeight,.16,'#e1e1e1',0,wallHeight/2,-4.5),box(12.15,.07,.2,'#eeeeee',0,wallHeight+.035,-4.5)]},
 {surfaces:[box(.16,wallHeight,9.1,'#dcdcdc',-6,wallHeight/2,0),box(.2,.07,9.1,'#eeeeee',-6,wallHeight+.035,0)]},
 {surfaces:[box(12.1,wallHeight,.16,'#e1e1e1',0,wallHeight/2,4.5),box(12.15,.07,.2,'#eeeeee',0,wallHeight+.035,4.5)]},
 {surfaces:[box(.16,wallHeight,9.1,'#dcdcdc',6,wallHeight/2,0),box(.2,.07,9.1,'#eeeeee',6,wallHeight+.035,0)]}
];
for(const wall of walls){
 wall.bounds=new THREE.Box3();wall.opacity=1;
 for(const mesh of wall.surfaces){
  mesh.userData.wallSurface=true;mesh.material=mesh.material.clone();mesh.material.transparent=true;
  mesh.updateMatrixWorld();wall.bounds.union(new THREE.Box3().setFromObject(mesh));
 }
 wall.bounds.expandByScalar(.08);
}

const grid=new THREE.GridHelper(12,24,0xcccccc,0xd3d3d3);grid.scale.z=.75;grid.position.y=-.018;grid.material.transparent=true;grid.material.opacity=.6;scene.add(grid);
function floorOutline(x,z,w,d,color){const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([a,b])=>new THREE.Vector3(x+a,.016,z+b));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color,dashSize:.14,gapSize:.10}));line.computeLineDistances();scene.add(line);}
box(2.5,.018,2.65,'#e7dfcc',-3.9,.002,-2.35);floorOutline(-3.9,-2.35,2.5,2.65,0xc1ad84);
box(3.35,.018,2.9,'#d8e3e4',3.5,.002,-2.7);floorOutline(3.5,-2.7,3.35,2.9,0x98afb0);
// Pickup pallet and cargo.
for(let i=0;i<3;i++)box(.08,.07,.9,'#c0a57e',-4.24+i*.34,.04,-2.35);
for(let i=0;i<4;i++)box(1.05,.05,.18,'#cfb894',-3.9,.1,-2.68+i*.22);
const cargo=new THREE.Group();scene.add(cargo);box(.66,.56,.61,'#c9a16c',0,.28,0,cargo);box(.12,.012,.62,'#e2c693',0,.565,0,cargo);box(.12,.56,.014,'#dfbf88',0,.28,.312,cargo);box(.2,.12,.014,'#eee4ce',.18,.35,.32,cargo);
// Workbench.
for(const x of [2.35,4.65])for(const z of [-3.4,-2.7])box(.12,.9,.12,'#899c98',x,.45,z);
rounded(2.8,.16,1.05,.07,'#b6c8c5',3.5,.98,-3.05);box(2.35,.08,.65,'#a0b5ad',3.5,.3,-3.05);
box(.65,.035,.42,'#e6eee7',3.1,1.09,-3.02);box(.32,.06,.08,'#718782',4.3,1.11,-3.1);cylinder(.06,.06,.025,'#cda978',4.05,1.1,-2.9);
const builtItem=new THREE.Group();builtItem.position.set(3.6,1.09,-3.05);scene.add(builtItem);rounded(.56,.11,.5,.1,'#6c8e79',0,.055,0,builtItem);cylinder(.16,.2,.3,'#c4d5bd',0,.25,0,builtItem);cylinder(.2,.2,.07,'#e3ebd9',0,.43,0,builtItem);builtItem.visible=false;
// A low storage island gives navigation a meaningful obstacle.
rounded(1.35,.65,1.2,.07,'#cbd2bf',-.35,.325,.15);box(1.18,.025,1.03,'#dce1cf',-.35,.69,.15);box(.58,.36,.55,'#c7bda2',-.55,.88,.1);box(.09,.02,.56,'#e7dac0',-.55,1.07,.1);box(.28,.22,.34,'#acbba2',.02,.81,.36);
function plant(x,z){cylinder(.26,.19,.42,'#c8cebc',x,.21,z);cylinder(.21,.21,.02,'#7a8162',x,.43,z);for(let i=0;i<7;i++){const a=i*2.4;const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),mat(i%2?'#8c9f78':'#a0b38b'));leaf.scale.set(.13,.48,.09);leaf.position.set(x+Math.sin(a)*.15,.73+(i%3)*.08,z+Math.cos(a)*.15);leaf.rotation.set(Math.cos(a)*.5,0,Math.sin(a)*.5);leaf.castShadow=true;scene.add(leaf);}}
plant(-4.95,3.2);plant(5.05,-3.65);
// Charging bay marks the start without adding another task.
box(1.45,.012,1.25,'#d7d7d7',-2.7,.005,2.3);floorOutline(-2.7,2.3,1.45,1.25,0xa0a0a0);
const robot=new THREE.Group();scene.add(robot);robot.rotation.y=sim.robot.angle;
rounded(.72,.25,.86,.17,'#eeeeee',0,.28,0,robot);rounded(.64,.07,.76,.14,'#404040',0,.43,0,robot);
for(const x of [-.39,.39])for(const z of [-.23,.23]){const wheel=cylinder(.135,.135,.09,'#252525',x,.17,z,robot,20);wheel.rotation.z=Math.PI/2;}
cylinder(.19,.23,.42,'#dddddd',0,.66,-.12,robot);rounded(.52,.28,.33,.08,'#f5f5f5',0,.96,-.1,robot);rounded(.4,.12,.015,.04,'#171717',0,1,-.1+.185,robot);
for(const x of [-.105,.105]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.027,12,8),new THREE.MeshBasicMaterial({color:0xd8edd1}));eye.position.set(x,1.01,.108);robot.add(eye);}
cylinder(.04,.04,.08,'#242424',0,1.16,-.1,robot);for(const x of [-.29,.29]){box(.07,.3,.08,'#969696',x,.61,.18,robot);box(.07,.07,.27,'#444444',x,.49,.29,robot);}
const selection=new THREE.Mesh(new THREE.RingGeometry(.63,.66,64),new THREE.MeshBasicMaterial({color:0x242424,transparent:true,opacity:.65,side:THREE.DoubleSide}));selection.rotation.x=-Math.PI/2;selection.position.y=.025;scene.add(selection);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pathLine=null;const routeMarkers=new THREE.Group();scene.add(routeMarkers);
function notice(message){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,3200);}
function command(type,target,event={}){if(sim.mode!=='guide'){notice('Switch to click-to-guide to plan tasks.');return;}selected=true;labelHoldUntil=performance.now()+1500;const error=addTask(sim,type,target,true);if(error)notice(error);renderUI(true);}
const labels={move:'Move to point',pickup:'Pick up box',build:'Build an item',drop:'Put down box',putdown:'Put down box'};
function taskLabel(task){return task.type==='drive'?`Move ${task.direction} · ${task.meters} m`:task.type==='turn'?`Turn ${task.direction}`:labels[task.type];}
function taskStatus(task){return task.type==='drive'?`Moving ${task.direction}`:task.type==='turn'?'Turning':task.type==='putdown'?'Putting down':task.phase==='travel'?'On the way':task.type==='build'?'Assembling':task.type==='pickup'?'Picking up':'Arriving';}
let lastVoiceCompletion=0;
function voiceState(state,message){
 const active=state==='starting'||state==='listening';
 $('voice-toggle').setAttribute('aria-pressed',active);$('voice-toggle-label').textContent=active?'Stop listening':'Start listening';
 $('voice-state').textContent=message;$('voice-controls').dataset.state=state;
 if(['idle','error','unsupported'].includes(state)&&sim.mode==='voice'&&sim.queue.length)sim.paused=true;
}
const voice=new VoiceRecognition({
 Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,
 onState:voiceState,
 onTranscript:(text,final)=>{$('voice-heard').hidden=false;$('voice-heard').textContent=text;$('voice-heard').classList.toggle('interim',!final);},
 onFinal:text=>{
  if(sim.mode!=='voice')return;
  const result=executeVoiceTranscript(sim,text);$('voice-feedback').textContent=result.message;
  if(result.micOff)voice.stop();
  renderUI(true);
 }
});
if(!voice.supported){$('voice-toggle').disabled=true;voiceState('unsupported','Voice is unavailable in this browser. Open this site in Chrome or Safari.');}
$('voice-toggle').onclick=()=>{if(voice.wanted)voice.stop();else voice.start();};

function renderUI(force=false){
 const task=sim.queue[0],moving=sim.mode==='joystick'&&(joy.x||joy.z||keys.size);
 const status=sim.paused&&task?'Tasks paused':task?taskStatus(task):moving?'Driving':sim.carrying?'Carrying a box':sim.built?'Assembly complete':'Ready to move';
 const completed=sim.completed.at(-1);
 if(completed&&completed.id!==lastVoiceCompletion){lastVoiceCompletion=completed.id;if(completed.outcome){if(sim.mode==='voice')$('voice-feedback').textContent=completed.outcome;else notice(completed.outcome);}}
 if(status!==lastState){$('robot-state').textContent=status;lastState=status;}
 $('cargo-icon').hidden=!sim.carrying;$('pause').disabled=!task;$('clear').disabled=!task;$('manual-pickup').disabled=sim.carrying||!sim.box;$('manual-drop').disabled=!sim.carrying;
 const signature=JSON.stringify([sim.queue.map(t=>[t.id,t.phase]),sim.completed.length,sim.paused]);
 if(force||signature!==lastQueue){lastQueue=signature;$('queue-count').textContent=sim.queue.length;$('pause').setAttribute('aria-label',sim.paused?'Resume tasks':'Pause tasks');$('pause').title=sim.paused?'Resume tasks':'Pause tasks';$('pause').innerHTML=sim.paused?'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
 $('queue').innerHTML=sim.queue.length?sim.queue.map((t,i)=>`<div class="task ${i===0?'current':''}"><span class="task-number">${String(i+1).padStart(2,'0')}</span><span><strong>${taskLabel(t)}</strong><small>${i===0?(sim.paused?'Paused':taskStatus(t)):'Queued'}</small></span><button class="remove" data-remove="${t.id}" aria-label="Remove ${taskLabel(t).toLowerCase()}">×</button>${i===0?'<div class="task-progress" style="transform:scaleX(0)"></div>':''}</div>`).join(''):'';
 $('queue').hidden=!sim.queue.length;document.querySelector('.queue-buttons').hidden=!sim.queue.length;document.querySelector('.queue-section').classList.toggle('has-tasks',!!sim.queue.length);refreshRoute();}
 const progress=document.querySelector('.task-progress');if(progress)progress.style.transform=`scaleX(${task?.progress||0})`;
}
function refreshRoute(){if(pathLine){scene.remove(pathLine);pathLine.geometry.dispose();pathLine.material.dispose();pathLine=null;}while(routeMarkers.children.length){const c=routeMarkers.children[0];routeMarkers.remove(c);c.geometry.dispose();c.material.dispose();}if(!sim.queue.length||['drive','turn','putdown'].includes(sim.queue[0].type))return;
 let points=[new THREE.Vector3(sim.robot.x,.035,sim.robot.z)];for(const t of sim.queue){if(['drive','turn','putdown'].includes(t.type))break;const previous=points.at(-1);const route=t.path||findPath({x:previous.x,z:previous.z},t.target)||[];for(const p of route)points.push(new THREE.Vector3(p.x,.035,p.z));const marker=new THREE.Mesh(new THREE.RingGeometry(.17,.205,32),new THREE.MeshBasicMaterial({color:0x242424,side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.set(t.target.x,.04,t.target.z);routeMarkers.add(marker);}
 pathLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x242424,dashSize:.1,gapSize:.09,transparent:true,opacity:.7}));pathLine.computeLineDistances();scene.add(pathLine);}
function setMode(mode){
 if(sim.mode==='voice'&&mode!=='voice')voice.stop();
 sim.mode=mode;keys.clear();releaseJoystick();if(mode!=='guide'&&sim.queue.length)sim.paused=true;
 for(const m of ['guide','joystick','voice']){$(m+'-mode').classList.toggle('active',m===mode);$(m+'-mode').setAttribute('aria-pressed',m===mode);if($(m+'-controls'))$(m+'-controls').hidden=m!==mode;}
 renderUI(true);
}
function setView(next){
 labelHoldUntil=0;hoveredLabels.clear();view=next;camera=next==='top'?topCamera:chase.camera;
 if(next==='third')chase.reset(sim.robot);
 for(const [id,value] of [['third-person','third'],['top-down','top']]){$(id).classList.toggle('active',next===value);$(id).setAttribute('aria-pressed',next===value);}resize();
}
function resize(){
 const {width:w,height:h}=$('viewport').getBoundingClientRect();renderer.setSize(w,h);const aspect=w/h;
 chase.camera.aspect=aspect;chase.camera.fov=aspect<1?72:62;chase.camera.updateProjectionMatrix();
 const span=Math.max(10.7,13.9/aspect);topCamera.left=-span*aspect/2;topCamera.right=span*aspect/2;topCamera.top=span/2;topCamera.bottom=-span/2;topCamera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('viewport'));
function projectLabel(id,x,y,z){
 if(performance.now()<labelHoldUntil||hoveredLabels.has(id))return;
 const worldPoint=new THREE.Vector3(x,y,z),p=worldPoint.clone().project(camera),r=$('viewport').getBoundingClientRect(),label=$(id);
 const local=worldPoint.clone().applyMatrix4(camera.matrixWorldInverse);
 const offscreen=p.z<-1||p.z>1||Math.abs(p.x)>.86||Math.abs(p.y)>.8;
 let screenX=(p.x*.5+.5)*r.width,screenY=(-p.y*.5+.5)*r.height;
 if(offscreen){screenX=local.x<0?74:r.width-74;screenY=r.height*.52;}
 label.style.left=THREE.MathUtils.clamp(screenX,68,r.width-68)+'px';
 label.style.top=THREE.MathUtils.clamp(screenY,160,Math.max(160,r.height-140))+'px';
 label.classList.toggle('offscreen',offscreen);label.querySelector('.label-arrow').textContent=offscreen?(local.x<0?'←':'→'):'↗';
}
function keepRobotVisible(dt){
 for(const wall of walls){
  const blocked=view==='third'&&wallBlocksRobot(wall.bounds,camera.position,sim.robot);
  const targetOpacity=blocked?.18:1;
  wall.opacity+=(targetOpacity-wall.opacity)*(1-Math.exp(-dt*18));
  if(Math.abs(wall.opacity-targetOpacity)<.001)wall.opacity=targetOpacity;
  for(const mesh of wall.surfaces){mesh.material.opacity=wall.opacity;mesh.material.depthWrite=wall.opacity>.99;}
 }

 for(const mesh of fadedMeshes){mesh.material.opacity=1;mesh.material.transparent=false;mesh.material.depthWrite=true;}fadedMeshes.clear();
 if(view!=='third')return;
 const target=new THREE.Vector3(sim.robot.x,.85,sim.robot.z),direction=target.clone().sub(camera.position);
 occlusionRay.set(camera.position,direction.clone().normalize());occlusionRay.far=direction.length()-.4;
 for(const hit of occlusionRay.intersectObjects(scene.children,false)){
  const mesh=hit.object;if(!mesh.isMesh||mesh===floor||mesh.userData.wallSurface||!mesh.castShadow)continue;
  if(!mesh.userData.cameraMaterial){mesh.material=mesh.material.clone();mesh.userData.cameraMaterial=true;}
  mesh.material.transparent=true;mesh.material.opacity=.16;mesh.material.depthWrite=false;fadedMeshes.add(mesh);
 }
}
$('guide-mode').onclick=()=>setMode('guide');$('joystick-mode').onclick=()=>setMode('joystick');$('voice-mode').onclick=()=>setMode('voice');$('third-person').onclick=()=>setView('third');$('top-down').onclick=()=>setView('top');$('recenter').onclick=()=>{chase.reset(sim.robot);resize();};
for(const id of ['pickup-label','assembly-label']){
 $(id).addEventListener('pointerenter',()=>hoveredLabels.add(id));
 $(id).addEventListener('pointerleave',()=>hoveredLabels.delete(id));
}
$('pickup-label').onclick=e=>command('pickup',null,e);
$('assembly-label').onclick=e=>command('build',null,e);
$('select-robot').onclick=()=>{selected=true;renderer.domElement.focus({preventScroll:true});};
$('pause').onclick=()=>{sim.paused=!sim.paused;renderUI(true);};
function clearTasks(){sim.queue=[];sim.activeTime=0;sim.paused=false;renderUI(true);}
$('clear').onclick=clearTasks;
function stop(){voice.stop();clearTasks();releaseJoystick();keys.clear();renderUI(true);}

$('reset').onclick=()=>{voice.stop();lastVoiceCompletion=0;$('voice-heard').hidden=true;$('voice-feedback').textContent='Try “Go forward” or “Pick up the box”.';sim=createSimulation();labelHoldUntil=0;hoveredLabels.clear();selected=true;builtItem.visible=false;robot.rotation.y=sim.robot.angle;chase.reset(sim.robot);setMode('guide');$('notice').hidden=true;renderUI(true);};
$('queue').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){const i=sim.queue.findIndex(t=>t.id===+b.dataset.remove);sim.queue.splice(i,1);if(i===0)sim.activeTime=0;validateQueue();renderUI(true);}};
function validateQueue(){let carrying=sim.carrying;sim.queue=sim.queue.filter(t=>{if(t.type==='pickup'){if(carrying)return false;carrying=true;}if(['build','putdown','drop'].includes(t.type)){if(!carrying)return false;carrying=false;}return true;});for(const t of sim.queue)t.path=null;}
$('manual-pickup').onclick=()=>{const error=pickup(sim);if(error)notice(error);renderUI(true);};$('manual-drop').onclick=()=>{const error=drop(sim);if(error)notice(error);renderUI(true);};
renderer.domElement.addEventListener('pointerdown',e=>{
 if(pointerStart||e.button>0)return;
 pointerStart={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,id:e.pointerId,dragged:false};
 renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove',e=>{
 if(!pointerStart||e.pointerId!==pointerStart.id)return;
 if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)pointerStart.dragged=true;
 if(pointerStart.dragged&&view==='third')chase.orbit(e.clientX-pointerStart.lastX,e.clientY-pointerStart.lastY,performance.now());
 pointerStart.lastX=e.clientX;pointerStart.lastY=e.clientY;
});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!pointerStart||e.pointerId!==pointerStart.id)return;
 const wasDrag=pointerStart.dragged;pointerStart=null;
 if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
 if(wasDrag)return;
 const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
 if(raycaster.intersectObject(robot,true).length){selected=true;return;}
 if(sim.mode!=='guide')return;
 if(sim.box&&raycaster.intersectObject(cargo,true).length){command('pickup',null,e);return;}
 const hit=raycaster.intersectObject(floor)[0];if(!hit)return;
 if(Math.abs(hit.point.x-3.5)<1.6&&hit.point.z<-1.3)command('build',null,e);
 else if(Math.abs(hit.point.x+3.9)<1.25&&Math.abs(hit.point.z+2.35)<1.3&&sim.box&&Math.hypot(sim.box.x+3.9,sim.box.z+2.35)<.2)command('pickup',null,e);
 else command('move',{x:hit.point.x,z:hit.point.z},e);
});
for(const event of ['pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>{pointerStart=null;});
function moveJoystick(e){const r=$('joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dz=e.clientY-r.top-r.height/2,d=Math.hypot(dx,dz),scale=Math.min(1,54/Math.max(1,d));joy={x:dx*scale/54,z:dz*scale/54};$('joystick-knob').style.transform=`translate(${joy.x*48}px,${joy.z*48}px)`;if(sim.queue.length)sim.paused=true;}
$('joystick').addEventListener('pointerdown',e=>{if(joystickPointer!==null)return;joystickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveJoystick(e);});$('joystick').addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)moveJoystick(e);});
function releaseJoystick(){joystickPointer=null;joy={x:0,z:0};$('joystick-knob').style.transform='translate(0,0)';}
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,releaseJoystick);
window.addEventListener('keydown',e=>{if(e.key==='Escape'){stop();return;}if(sim.mode==='joystick'&&['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();keys.add(e.key);if(sim.queue.length)sim.paused=true;}});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>{releaseJoystick();keys.clear();});document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();releaseJoystick();keys.clear();}});
window.addEventListener('pagehide',()=>voice.stop());
let last=performance.now(),routeTick=0;function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;let input={x:joy.x+(keys.has('d')||keys.has('ArrowRight')?1:0)-(keys.has('a')||keys.has('ArrowLeft')?1:0),z:joy.z+(keys.has('s')||keys.has('ArrowDown')?1:0)-(keys.has('w')||keys.has('ArrowUp')?1:0)};
 // Direct control is aligned with the current view.
 if(sim.mode==='joystick'&&(input.x||input.z))manualMovingUntil=now+900;
 if(view==='third')input=screenToWorld(input,chase.yaw);
 update(sim,dt,input);robot.position.set(sim.robot.x,0,sim.robot.z);let delta=sim.robot.angle-robot.rotation.y;delta=Math.atan2(Math.sin(delta),Math.cos(delta));robot.rotation.y+=delta*Math.min(1,dt*14);
 selection.visible=selected;selection.position.set(sim.robot.x,.025,sim.robot.z);
 if(sim.carrying){cargo.visible=true;const pos=new THREE.Vector3(0,.5,.38).applyAxisAngle(new THREE.Vector3(0,1,0),robot.rotation.y);cargo.position.set(sim.robot.x+pos.x,pos.y,sim.robot.z+pos.z);cargo.rotation.y=robot.rotation.y;cargo.scale.setScalar(.72);}else if(sim.box){cargo.visible=true;cargo.scale.setScalar(1);cargo.rotation.y=0;cargo.position.set(sim.box.x,Math.hypot(sim.box.x-PICKUP.x,sim.box.z-PICKUP.z)<.1?.13:0,sim.box.z);}else cargo.visible=false;
 const building=sim.queue[0]?.type==='build'&&sim.queue[0]?.phase==='work';builtItem.visible=sim.built||building;if(building){const p=Math.max(.06,sim.queue[0].progress);builtItem.scale.set(1,p,1);builtItem.rotation.y=now*.002;}else{builtItem.scale.setScalar(1);builtItem.rotation.y=0;}
 if(view==='third')chase.update(sim.robot,dt,now>manualMovingUntil,false,now);
 keepRobotVisible(dt);projectLabel('pickup-label',-3.9,.08,-.7);projectLabel('assembly-label',3.5,.08,-.9);
 renderUI();routeTick+=dt;if(routeTick>.22){refreshRoute();routeTick=0;}renderer.render(scene,camera);
}
resize();renderUI(true);requestAnimationFrame(frame);
