import * as THREE from './vendor/three.module.js';

// Camera yaw describes the direction from the camera toward the robot.
export function screenToWorld(input,yaw){
 return {x:-Math.cos(yaw)*input.x-Math.sin(yaw)*input.z,z:Math.sin(yaw)*input.x-Math.cos(yaw)*input.z};
}
export class ChaseRig{
 constructor(){
  this.camera=new THREE.PerspectiveCamera(62,1,.08,80);
  this.yaw=0;this.height=2.65;this.distance=4.1;this.orbitUntil=0;
  this.anchor=new THREE.Vector3();this.target=new THREE.Vector3();this.desired=new THREE.Vector3();
 }
 reset(robot){this.yaw=robot.angle;this.height=2.65;this.orbitUntil=0;this.anchor.set(robot.x,0,robot.z);this.update(robot,0,true,true);}
 orbit(dx,dy,now){this.yaw-=dx*.006;this.height=THREE.MathUtils.clamp(this.height+dy*.012,1.45,4.5);this.orbitUntil=now+4000;}
 update(robot,dt,followHeading=true,snap=false,now=performance.now()){
  if(followHeading&&now>this.orbitUntil){const delta=Math.atan2(Math.sin(robot.angle-this.yaw),Math.cos(robot.angle-this.yaw));this.yaw+=delta*(snap?1:1-Math.exp(-dt*3.5));}
  const blend=snap?1:1-Math.exp(-dt*12);
  this.anchor.lerp(this.desired.set(robot.x,0,robot.z),blend);
  const sin=Math.sin(this.yaw),cos=Math.cos(this.yaw);
  this.camera.position.set(this.anchor.x-sin*this.distance,this.height,this.anchor.z-cos*this.distance);
  // Looking a little ahead keeps the robot in the lower half of the view.
  this.target.set(this.anchor.x+sin*1.35,.85,this.anchor.z+cos*1.35);
  this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
 }
}

// Test the whole robot silhouette, not just a single point on its head.
export function wallBlocksRobot(bounds,cameraPosition,robot){
 if(bounds.containsPoint(cameraPosition))return true;
 const samples=[[0,.25,0],[0,.85,0],[0,1.2,0],[-.42,.65,0],[.42,.65,0],[0,.65,-.42],[0,.65,.42]];
 const ray=new THREE.Ray(),target=new THREE.Vector3(),direction=new THREE.Vector3(),hit=new THREE.Vector3();
 for(const [x,y,z] of samples){
  target.set(robot.x+x,y,robot.z+z);direction.copy(target).sub(cameraPosition);
  const distance=direction.length();ray.set(cameraPosition,direction.normalize());
  if(ray.intersectBox(bounds,hit)&&hit.distanceTo(cameraPosition)<distance-.05)return true;
 }
 return false;
}
