const themes=['light','dark'];
export const mediaPath=(theme,kind,file)=>`assets/${kind}/${theme==='dark'?'dark/':''}${file}`;

export function mappedVideoTime(time,from,to){
 const index=Math.max(0,from.steps.findLastIndex(step=>step.time<=time));
 const start=from.steps[index].time,end=from.steps[index+1]?.time??from.duration;
 const next=to.steps[index].time,nextEnd=to.steps[index+1]?.time??to.duration;
 return Math.min(to.duration-.05,next+(nextEnd-next)*Math.max(0,Math.min(1,(time-start)/(end-start))));
}

export async function createThemeControl({getCopy,onChange}){
 let theme=document.documentElement.dataset.theme==='dark'?'dark':'light';
 const video=document.querySelector('#walkthrough-video');
 const metadata=Object.fromEntries(await Promise.all(themes.map(async value=>{
  const response=await fetch(mediaPath(value,'video','metadata.json'));
  if(!response.ok)throw Error('Could not load video metadata');
  return [value,await response.json()];
 })));
 let pending=null,controller=null;
 const captions=()=>{for(const track of video.textTracks)track.mode=track.language===document.documentElement.lang?'showing':'disabled';};
 function updateLabels(){
  const copy=getCopy();
  document.querySelector('#theme-switch').setAttribute('aria-label',copy.appearance);
  for(const button of document.querySelectorAll('[data-theme-choice]')){
   const selected=button.dataset.themeChoice===theme;
   button.setAttribute('aria-pressed',String(selected));
   button.setAttribute('aria-label',copy[button.dataset.themeChoice+'Theme']);
   button.title=copy[button.dataset.themeChoice+'Theme'];
  }
 }
 function change(next){
  if(next===theme)return;
  const state=pending??{time:video.currentTime,theme,playing:!video.paused&&!video.ended};
  pending=state;controller?.abort();controller=new AbortController();
  video.pause();theme=next;
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0e1013':'#f6f7f9';
  try{localStorage.setItem('bendorithm.website.theme',theme);}catch{/* Session switching still works. */}
  updateLabels();onChange(theme);
  video.poster=mediaPath(theme,'video','poster.webp');
  for(const source of video.querySelectorAll('source'))source.src=mediaPath(theme,'video',source.type==='video/webm'?'walkthrough.webm':'walkthrough.mp4');
  for(const track of video.querySelectorAll('track'))track.src=mediaPath(theme,'video',`walkthrough-${track.srclang}.vtt`);
  video.addEventListener('loadedmetadata',()=>{
   video.currentTime=mappedVideoTime(state.time,metadata[state.theme],metadata[theme]);
   captions();pending=null;
   if(state.playing)video.play().catch(()=>{});
  },{once:true,signal:controller.signal});
  video.load();captions();
 }
 for(const button of document.querySelectorAll('[data-theme-choice]'))button.onclick=()=>change(button.dataset.themeChoice);
 // Set sources on startup before playback, including a saved dark preference.
 if(theme==='dark'){
  video.poster=mediaPath(theme,'video','poster.webp');
  for(const source of video.querySelectorAll('source'))source.src=mediaPath(theme,'video',source.type==='video/webm'?'walkthrough.webm':'walkthrough.mp4');
  for(const track of video.querySelectorAll('track'))track.src=mediaPath(theme,'video',`walkthrough-${track.srclang}.vtt`);
  video.load();
 }
 document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0e1013':'#f6f7f9';
 updateLabels();onChange(theme);
 return {updateLabels};
}
