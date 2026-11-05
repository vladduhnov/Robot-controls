import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceCommands,executeVoiceTranscript} from '../dist/voice-commands.js';
import {VoiceRecognition} from '../dist/voice-recognition.js';
import {createSimulation,update,isFree} from '../dist/simulation.js';
const run=(sim,seconds)=>{for(let i=0;i<seconds*60;i++){update(sim,1/60);assert.ok(isFree(sim.robot.x,sim.robot.z));}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} ≈ ${b}`);
function simulation(){const sim=createSimulation();sim.mode='voice';return sim;}

test('voice understands supported phrases, polite prefixes, amounts and combined commands',()=>{
 assert.deepEqual(parseVoiceCommands('Chappie, please go forward two meters.'),[{type:'drive',direction:'forward',meters:2}]);
 assert.equal(parseVoiceCommands('go back')[0].direction,'backward');
 assert.equal(parseVoiceCommands('move left half a meter')[0].meters,.5);
 assert.equal(parseVoiceCommands('move left half meter')[0].meters,.5);
 assert.deepEqual(parseVoiceCommands('pick up the box, then assemble').map(c=>c.type),['pickup','build']);
 assert.equal(parseVoiceCommands('put the box down')[0].type,'putdown');
 assert.equal(parseVoiceCommands('turn right 180 degrees')[0].radians,-Math.PI);
});
test('unknown or negated speech does not mutate the simulation',()=>{
 const s=simulation(),before=structuredClone(s);
 for(const text of ["don't go forward",'never pick up the box','go forward then dance','hello there','go forward 100 meters']){
  assert.equal(executeVoiceTranscript(s,text).ok,false);assert.deepEqual(s,before);
 }
});
test('forward and backward use Chappie’s heading and preserve it',()=>{
 const s=simulation(),start={...s.robot};
 executeVoiceTranscript(s,'go forward');run(s,2);
 near(s.robot.x,start.x+Math.sin(start.angle));near(s.robot.z,start.z+Math.cos(start.angle));near(s.robot.angle,start.angle);
 executeVoiceTranscript(s,'go backward');run(s,2);near(s.robot.x,start.x);near(s.robot.z,start.z);
});
test('turn then drive resolves the new heading when each command starts',()=>{
 const s=simulation();s.robot={x:1.5,z:2,angle:0};
 assert.equal(executeVoiceTranscript(s,'turn left then go forward two meters').ok,true);run(s,5);
 near(s.robot.angle,Math.PI/2);near(s.robot.x,3.5);near(s.robot.z,2);
 assert.deepEqual(s.completed.map(t=>t.type),['turn','drive']);
});
test('voice movement stops at furniture and room boundaries',()=>{
 const s=simulation();s.robot={x:1.5,z:2,angle:Math.PI/2};executeVoiceTranscript(s,'go forward five meters');run(s,6);
 assert.equal(s.queue.length,0);assert.ok(s.robot.x<=5.65);assert.match(s.completed[0].outcome,/obstacle/);
 s.robot={x:-.35,z:2,angle:Math.PI};executeVoiceTranscript(s,'go forward three meters');run(s,4);
 assert.ok(s.robot.z>.9);assert.match(s.completed.at(-1).outcome,/obstacle/);
});
test('pick up then assemble uses navigation and completes in spoken order',()=>{
 const s=simulation();assert.equal(executeVoiceTranscript(s,'pick up the box then assemble').ok,true);run(s,30);
 assert.deepEqual(s.completed.map(t=>t.type),['pickup','build']);assert.equal(s.built,true);assert.equal(s.carrying,false);
});
test('voice can put down and later pick up the same box',()=>{
 const s=simulation();executeVoiceTranscript(s,'pick up the box then go backward then put down the box');run(s,15);
 assert.equal(s.carrying,false);assert.ok(s.box);const point={...s.box};
 assert.equal(executeVoiceTranscript(s,'pick up the box').ok,true);run(s,6);assert.equal(s.carrying,true);near(s.robot.x,point.x);near(s.robot.z,point.z);
});
test('putting down at the assembly bench builds without deleting later tasks',()=>{
 const s=simulation();executeVoiceTranscript(s,'pick up the box then go to assembly then put down the box then turn around');run(s,30);
 assert.equal(s.built,true);assert.deepEqual(s.completed.map(t=>t.type),['pickup','move','build','turn']);
});
test('pause, resume and stop act immediately',()=>{
 const s=simulation();executeVoiceTranscript(s,'go forward');executeVoiceTranscript(s,'pause');const point={...s.robot};run(s,2);assert.deepEqual(s.robot,point);
 executeVoiceTranscript(s,'resume');run(s,.2);assert.notDeepEqual(s.robot,point);
 executeVoiceTranscript(s,'stop');const stopped={...s.robot};run(s,2);assert.equal(s.queue.length,0);assert.deepEqual(s.robot,stopped);
});
test('invalid compound actions leave the existing queue untouched',()=>{
 const s=simulation();executeVoiceTranscript(s,'go forward');const before=structuredClone(s);
 assert.equal(executeVoiceTranscript(s,'turn left then assemble').ok,false);assert.deepEqual(s,before);
});
test('manual override safely restarts a queued voice movement',()=>{
 const s=simulation();executeVoiceTranscript(s,'go forward');run(s,.2);s.mode='joystick';update(s,.1,{x:1,z:0});
 assert.equal(s.paused,true);assert.equal(s.queue[0].phase,'pending');s.mode='voice';s.paused=false;run(s,3);assert.equal(s.queue.length,0);
});
function harness(){
 const instances=[],states=[],finals=[],transcripts=[],timers=new Map();let time=1000,next=1;
 class FakeRecognition{constructor(){instances.push(this);}start(){this.onstart?.();}abort(){this.aborted=true;}result(text,final=true,index=0){const results=[];results[index]=Object.assign([{transcript:text}],{isFinal:final});this.onresult?.({resultIndex:index,results});}}
 const voice=new VoiceRecognition({Recognition:FakeRecognition,onState:(state,message)=>states.push([state,message]),onTranscript:(text,final)=>transcripts.push([text,final]),onFinal:text=>finals.push(text),now:()=>time,schedule:(fn,delay)=>{const id=next++;timers.set(id,{fn,delay});return id;},cancel:id=>timers.delete(id)});
 return {voice,instances,states,finals,transcripts,timers,advance:ms=>time+=ms,fire:delay=>{const entry=[...timers].find(([,t])=>t.delay===delay);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();}};
}
test('speech executes only final results, once per result index',()=>{
 const h=harness();h.voice.start();const recognition=h.instances[0];
 recognition.result('go for',false);assert.equal(h.finals.length,0);
 recognition.result('go forward');recognition.result('go forward');assert.deepEqual(h.finals,['go forward']);
 recognition.result('go forward',true,1);assert.equal(h.finals.length,2);h.voice.stop();
});
test('stop listening aborts capture and ignores stale recognition events',()=>{
 const h=harness();h.voice.start();const recognition=h.instances[0],lateResult=recognition.onresult;
 h.voice.stop();assert.equal(recognition.aborted,true);assert.equal(h.voice.wanted,false);assert.equal(h.timers.size,0);
 lateResult({resultIndex:0,results:[Object.assign([{transcript:'go forward'}],{isFinal:true})]});assert.equal(h.finals.length,0);
});
test('continuous listening reconnects after silence and cancels pending restart on stop',()=>{
 const h=harness();h.voice.start();h.advance(3000);h.instances[0].onend();h.fire(300);assert.equal(h.instances.length,2);
 h.advance(3000);h.instances[1].onend();h.voice.stop();assert.equal(h.timers.size,0);
});
test('permission and network errors stop capture with actionable feedback',()=>{
 for(const error of ['not-allowed','audio-capture','network']){const h=harness();h.voice.start();h.instances[0].onerror({error});assert.equal(h.voice.wanted,false);assert.equal(h.instances[0].aborted,true);assert.equal(h.states.at(-1)[0],'error');assert.ok(h.states.at(-1)[1].length>20);assert.equal(h.timers.size,0);}
});
test('unsupported browsers do not try to capture audio',()=>{
 const states=[];const voice=new VoiceRecognition({onState:(state,message)=>states.push([state,message])});voice.start();assert.equal(voice.supported,false);assert.equal(voice.wanted,false);assert.equal(states.at(-1)[0],'unsupported');
});
test('speech service quick failures do not cause endless reconnect loops',()=>{
 const h=harness();h.voice.start();h.instances[0].onend();h.fire(300);h.instances[1].onend();h.fire(300);h.instances[2].onend();assert.equal(h.voice.wanted,false);assert.equal(h.states.at(-1)[0],'error');
});

test('default timer adapters do not bind browser timers to the controller',t=>{
 const receivers=[];
 t.mock.method(globalThis,'setTimeout',function(){receivers.push(this);return 1;});
 t.mock.method(globalThis,'clearTimeout',function(){receivers.push(this);});
 class Recognition{start(){}abort(){}}
 const voice=new VoiceRecognition({Recognition});voice.start();voice.stop();
 assert.ok(receivers.length>=3);assert.ok(receivers.every(receiver=>receiver!==voice));
});
