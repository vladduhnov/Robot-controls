const errors={
 'not-allowed':'Microphone access blocked. Allow it in your browser’s site settings, then retry.',
 'service-not-allowed':'Speech recognition is blocked by this browser. Try opening the site in Chrome or Safari.',
 'audio-capture':'No microphone available. Connect one and retry.',
 'network':'Speech service unavailable. Check your connection and retry.',
 'language-not-supported':'English recognition is unavailable in this browser.',
 'aborted':'Listening stopped. Tap the microphone to retry.'
};
export class VoiceRecognition{
 constructor({Recognition,onState=()=>{},onTranscript=()=>{},onFinal=()=>{},schedule=(fn,delay)=>setTimeout(fn,delay),cancel=id=>clearTimeout(id),now=Date.now}){
  Object.assign(this,{Recognition,onState,onTranscript,onFinal,schedule,cancel,now});this.wanted=false;this.current=null;this.timer=null;this.watchdog=null;this.quickEnds=0;
 }
 get supported(){return !!this.Recognition;}
 start(){
  if(this.wanted)return;
  if(!this.supported){this.onState('unsupported','Voice is unavailable in this browser. Open the site in Chrome or Safari.');return;}
  this.wanted=true;this.quickEnds=0;this.open();
 }
 open(){
  if(!this.wanted||this.current)return;
  let recognition;
  try{recognition=new this.Recognition();}catch{this.fail('Speech recognition could not start. Try another browser.');return;}
  this.current=recognition;const seen=new Set();let started=this.now();
  recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
  recognition.onstart=()=>{if(this.current!==recognition||!this.wanted)return;this.cancel(this.watchdog);this.watchdog=null;started=this.now();this.onState('listening','Listening');};
  recognition.onresult=event=>{
   if(this.current!==recognition||!this.wanted)return;
   for(let i=event.resultIndex;i<event.results.length;i++){
    const result=event.results[i],text=result[0]?.transcript?.trim();if(!text)continue;
    if(result.isFinal){if(seen.has(i))continue;seen.add(i);this.quickEnds=0;this.onTranscript(text,true);this.onFinal(text);}
    else this.onTranscript(text,false);
    if(this.current!==recognition||!this.wanted)break;
   }
  };
  recognition.onerror=event=>{
   if(this.current!==recognition||!this.wanted)return;
   if(event.error==='no-speech')return;
   this.fail(errors[event.error]||'Speech recognition failed. Tap the microphone to retry.');
  };
  recognition.onend=()=>{
   if(this.current!==recognition)return;
   this.current=null;this.cancel(this.watchdog);this.watchdog=null;
   if(!this.wanted)return;
   this.quickEnds=this.now()-started<1500?this.quickEnds+1:0;
   if(this.quickEnds>=3){this.fail('Speech service stopped. Tap the microphone to retry.');return;}
   this.onState('starting','Reconnecting…');this.timer=this.schedule(()=>{this.timer=null;this.open();},300);
  };
  this.onState('starting','Starting microphone…');
  this.watchdog=this.schedule(()=>this.fail('Microphone did not start. Check browser permissions and retry.'),20000);
  try{recognition.start();}catch{this.fail('Microphone could not start. Check browser permissions and retry.');}
 }
 stop(){this.shutdown();this.onState('idle','Microphone off');}
 fail(message){this.shutdown();this.onState('error',message);}
 shutdown(){
  this.wanted=false;this.cancel(this.timer);this.cancel(this.watchdog);this.timer=null;this.watchdog=null;
  const recognition=this.current;this.current=null;
  if(recognition){recognition.onstart=null;recognition.onresult=null;recognition.onerror=null;recognition.onend=null;try{recognition.abort();}catch{}}
 }
}
