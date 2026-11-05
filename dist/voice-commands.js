import {addTask,ASSEMBLY} from './simulation.js';

const numberWords={half:.5,one:1,a:1,two:2,to:2,three:3,four:4,for:4,five:5};
const normalize=text=>text.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9.\s]/g,' ').replace(/\.(?!\d)/g,' ').replace(/\s+/g,' ').trim();
function parseOne(text){
 const phrase=normalize(text).replace(/\bhalf a (meter|metre)\b/g,'half $1').replace(/^(?:hey )?chappie\s+/,'').replace(/^(?:please|can you|could you)\s+/,'').replace(/\s+please$/,'');
 if(/\b(?:dont|do not|never|not)\b/.test(phrase))return null;
 if(/^(?:stop listening|microphone off|mic off)$/.test(phrase))return {type:'mic-off'};
 if(/^(?:stop|stop moving|stop robot|halt|cancel|cancel tasks|clear (?:the )?queue)$/.test(phrase))return {type:'stop'};
 if(/^(?:pause|pause tasks|wait)$/.test(phrase))return {type:'pause'};
 if(/^(?:resume|resume tasks|continue)$/.test(phrase))return {type:'resume'};
 if(/^(?:pick up|pickup|grab|collect)(?: (?:the |a )?(?:box|package|it))?$/.test(phrase))return {type:'pickup'};
 if(/^(?:put down|drop|release)(?: (?:the |a )?(?:box|package|it))?$/.test(phrase)||/^put (?:the box|it) down$/.test(phrase))return {type:'putdown'};
 if(/^(?:assemble|build|build an item|build the item|assemble (?:the |an )?(?:item|box)|start assembly|build something)$/.test(phrase))return {type:'build'};
 if(/^(?:go|move|drive)(?: over)? to (?:the )?(?:assembly(?: station)?|workbench|bench)$/.test(phrase))return {type:'station',station:'assembly'};
 if(/^(?:go|move|drive)(?: over)? to (?:the )?(?:pickup(?: station)?|box)$/.test(phrase))return {type:'station',station:'pickup'};
 const turn=phrase.match(/^(?:turn|rotate) (left|right|around)(?: (90|ninety|180|one hundred eighty) degrees)?$/);
 if(turn){if(turn[2]&&turn[1]==='around'&&!['180','one hundred eighty'].includes(turn[2]))return null;return {type:'turn',direction:turn[1],radians:turn[1]==='around'?Math.PI:(turn[1]==='left'?1:-1)*(['180','one hundred eighty'].includes(turn[2])?Math.PI:Math.PI/2)};}
 const move=phrase.match(/^(?:(?:go|move|drive|step) )?(forward|forwards|back|backward|backwards|left|right)(?: (?:by |for )?(half|one|a|two|to|three|four|for|five|\d+(?:\.\d+)?)(?: meters?|metres?|m))?$/);
 if(move){const meters=move[2]?(numberWords[move[2]]??Number(move[2])):1;if(meters<.25||meters>5)return null;return {type:'drive',direction:move[1].startsWith('back')?'backward':move[1]==='forwards'?'forward':move[1],meters};}
 return null;
}
export function parseVoiceCommands(transcript){
 const parts=normalize(transcript).split(/\s+(?:and then|then|and)\s+/);
 if(!parts.length||parts.length>6)return null;
 const commands=parts.map(parseOne);return commands.every(Boolean)?commands:null;
}
export function executeVoiceTranscript(sim,transcript){
 const commands=parseVoiceCommands(transcript);
 if(!commands)return {ok:false,message:'Command not recognized. Tap ? for command examples.'};
 if(commands.some(c=>c.type==='stop')){sim.queue=[];sim.activeTime=0;sim.paused=false;return {ok:true,message:'Stopped.'};}
 if(commands.some(c=>c.type==='mic-off'))return {ok:true,micOff:true,message:'Microphone off.'};
 // Validate a compound request before committing any part of it.
 const draft=structuredClone(sim),messages=[];
 for(const command of commands){
  let error=null;
  if(command.type==='pause'){draft.paused=true;messages.push('Tasks paused.');continue;}
  if(command.type==='resume'){draft.paused=false;messages.push(draft.queue.length?'Tasks resumed.':'No tasks to resume.');continue;}
  if(command.type==='pickup'||command.type==='build'){
   error=addTask(draft,command.type,null,true);messages.push(command.type==='pickup'?'Pick up box queued.':'Assembly queued.');
  }else if(command.type==='station'){
   const destination=command.station==='assembly'?ASSEMBLY:draft.box;
   if(!destination)error='There is no box at the pickup station.';
   else error=addTask(draft,'move',destination,true);
   messages.push(`Move to ${command.station} queued.`);
  }else{
   let cargo=draft.carrying;
   for(const task of draft.queue){if(task.type==='pickup')cargo=true;if(['build','drop','putdown'].includes(task.type))cargo=false;}
   if(command.type==='putdown'&&!cargo)error='Pick up a box first.';
   if(!error){
    const target={...(draft.queue.at(-1)?.target||draft.robot)};
    draft.queue.push({id:draft.nextId++,type:command.type,target,path:null,phase:'pending',progress:0,...command});draft.paused=false;
    messages.push(command.type==='drive'?`Move ${command.direction} ${command.meters} m queued.`:command.type==='turn'?`Turn ${command.direction} queued.`:'Put down box queued.');
   }
  }
  if(error)return {ok:false,message:error};
 }
 Object.assign(sim,draft);return {ok:true,message:messages.join(' ')};
}
