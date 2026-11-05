import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {ChaseRig,screenToWorld} from '../dist/camera-rig.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} ≈ ${b}`);
test('chase camera stays behind the robot and keeps it in frame in every heading',()=>{
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const rig=new ChaseRig(),robot={x:2,z:-1,angle};rig.camera.aspect=4/3;rig.camera.updateProjectionMatrix();rig.reset(robot);
  assert.ok(rig.camera.isPerspectiveCamera);
  const offset=rig.camera.position.clone().sub(new THREE.Vector3(robot.x,0,robot.z));
  assert.ok(offset.x*Math.sin(angle)+offset.z*Math.cos(angle)<-4);
  const projected=new THREE.Vector3(robot.x,.6,robot.z).project(rig.camera);
  assert.ok(Math.abs(projected.x)<.05&&projected.y<0&&projected.y>-.8&&projected.z<1);
 }
});
test('camera follows translation and turns across the angle wrap without a full spin',()=>{
 const rig=new ChaseRig();rig.reset({x:0,z:0,angle:Math.PI-.05});
 for(let i=0;i<120;i++)rig.update({x:3,z:2,angle:-Math.PI+.05},1/60,true,false,10000);
 near(rig.anchor.x,3);near(rig.anchor.z,2);assert.ok(Math.abs(rig.yaw-Math.PI)<.06);
});
test('forward joystick input points into the camera view; right stays perpendicular',()=>{
 for(const angle of [0,.7,Math.PI,-Math.PI/2]){
  const forward=screenToWorld({x:0,z:-1},angle),right=screenToWorld({x:1,z:0},angle);
  near(forward.x,Math.sin(angle));near(forward.z,Math.cos(angle));near(forward.x*right.x+forward.z*right.z,0);
 }
});
test('manual movement and orbit do not cause camera steering feedback',()=>{
 const rig=new ChaseRig();rig.reset({x:0,z:0,angle:0});
 rig.update({x:1,z:0,angle:Math.PI/2},1,false,false,10000);near(rig.yaw,0);
 rig.orbit(100,0,10000);rig.update({x:1,z:0,angle:Math.PI/2},1,true,false,11000);near(rig.yaw,-.6);
 rig.reset({x:1,z:0,angle:Math.PI/2});near(rig.yaw,Math.PI/2);
});

test('walls fade only when they obstruct the camera-to-robot view',async()=>{
 const {wallBlocksRobot}=await import('../dist/camera-rig.js');
 const wall=new THREE.Box3(new THREE.Vector3(-6,0,-4.6),new THREE.Vector3(6,3.3,-4.4));
 const robot={x:0,z:-2};
 assert.equal(wallBlocksRobot(wall,new THREE.Vector3(0,2.65,-6),robot),true,'behind wall');
 assert.equal(wallBlocksRobot(wall,new THREE.Vector3(0,2.65,2),robot),false,'inside room');
 assert.equal(wallBlocksRobot(wall,new THREE.Vector3(0,2.65,-4.5),robot),true,'camera inside wall thickness');
 assert.equal(wallBlocksRobot(wall,new THREE.Vector3(0,10,-6),robot),false,'camera sees over wall');
});
