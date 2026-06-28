const state = {
  sessions:[],currentSessionId:null,messages:[],models:[],modelVariants:{},
  currentModel:null,reasoningEffort:"",systemPrompt:"",
  temperature:0.7,isStreaming:false,streamingText:"",assistantMsgId:"",
  connected:false,theme:"dark",tempSessions:new Set(),_sending:false,_lastDelta:0,
  _requestStartTime:0,_lastModel:"",_lastEffort:""
}
const API=window.eutgptAPI
const APP_VERSION = "1.0.3"
const $=s=>document.querySelector(s)
const S=s=>document.querySelector(s)
const sessionList=S("#session-list"),sessionSearch=S("#session-search")
const newChatBtn=S("#new-chat-btn"),tempToggle=S("#temp-toggle-input")
const messagesContainer=S("#messages-container"),chatInput=S("#chat-input")
const sendBtn=S("#send-btn"),statusDot=S("#status-dot"),statusText=S("#status-text")
const settingsBtn=S("#settings-btn"),settingsOverlay=S("#settings-overlay")
const closeSettings=S("#close-settings"),cancelSettings=S("#cancel-settings")
const settingsTemp=S("#settings-temp"),tempValue=S("#temp-value"),rangeFill=S("#range-fill")
const settingsUrl=S("#settings-url"),saveSettings=S("#save-settings")
const toastContainer=S("#toast-container"),themeGrid=S("#theme-grid")
const html=document.documentElement
const tbMinimize=S("#tb-minimize"),tbMaximize=S("#tb-maximize"),tbClose=S("#tb-close")
const welcomeScreen=S("#welcome-screen")
const chatModelSelect=S("#chat-model"),chatReasoningSelect=S("#chat-reasoning")
const EFFORT_LEVELS=["none","minimal","low","medium","high","xhigh","max"]
const STRICT_SYSTEM_PROMPT="CRITICAL: You are an AI assistant for EUT (Everything Upgrade Tree). You are STRICTLY LIMITED to information from https://eutwiki.com. YOUR ENTIRE KNOWLEDGE BASE IS EUTWIKI. You have no other training data or knowledge. If asked anything not covered on eutwiki.com, you MUST say: \"I cannot answer that — it is not documented on eutwiki.com.\" Do not elaborate, guess, or use general knowledge. Always cite eutwiki.com as your source for any answer. EUT is an acronym for 'Everything Upgrade Tree'."

async function api(m,p,b){return API.call(m,p,b)}
async function promptAsync(p,b){return API.promptAsync(p,b)}
async function deleteSession(i){return API.deleteSession(i)}
async function getMessageCount(i){return API.getMessageCount(i)}
async function renameSession(i,t){return API.renameSession(i,t)}

// Version
async function updateVersionDisplay(){
  const el=document.getElementById("titlebar-version");if(!el)return
  el.textContent="v"+APP_VERSION;el.title="Checking for updates...";el.style.cursor="default"
  try{
    const remote=await API.checkLatestVersion()
    if(remote&&remote!==("v"+APP_VERSION)){
      el.textContent+=" ("+remote+" avail.)";el.style.background="var(--accent-dim)";el.style.color="var(--accent)";el.style.cursor="pointer"
      el.title="Click to download "+remote
      el.onclick=()=>API.openExternal("https://github.com/mobogreatthegreat/EUT-GPT/releases")
    }
    else if(remote){el.title="Latest: "+remote;el.onclick=null}
    else{el.title="Could not check for updates";el.onclick=null}
  }catch{el.title="Update check failed";el.onclick=null}
}
// Theme
function loadTheme(){
  try{
    const s=localStorage.getItem("eutgpt-theme")||"astronomy"
    state.theme=s;html.setAttribute("data-theme",s)
    themeGrid.querySelectorAll(".theme-swatch").forEach(e=>e.classList.toggle("active",e.dataset.theme===s))
  }catch{}
}
function setTheme(n){
  state.theme=n;html.setAttribute("data-theme",n)
  try{localStorage.setItem("eutgpt-theme",n)}catch{}
  themeGrid.querySelectorAll(".theme-swatch").forEach(e=>e.classList.toggle("active",e.dataset.theme===n))
  showToast("Theme: "+n)
}
themeGrid.addEventListener("click",e=>{const s=e.target.closest(".theme-swatch");if(s)setTheme(s.dataset.theme)})

// Toast
function showToast(m,d=3000){
  const el=document.createElement("div");el.className="toast"
  el.innerHTML="<span>"+m+"</span>"
  toastContainer.appendChild(el)
  setTimeout(()=>{el.classList.add("out");setTimeout(()=>el.remove(),300)},d)
}

// Window controls
tbMinimize.addEventListener("click",()=>API.minimize())
tbClose.addEventListener("click",()=>API.close())
tbMaximize.addEventListener("click",async()=>{await API.maximize();updateMaxBtn()})
async function updateMaxBtn(){tbMaximize.textContent=(await API.isMaximized())?"❐":"□"}

// Custom Dropdown
const allDropdowns=[]
class CustomDropdown{
  constructor(w){
    this.wrap=w;this.trigger=w.querySelector(".select-trigger");this.dropdown=w.querySelector(".select-dropdown")
    this.optionsContainer=this.dropdown.querySelector(".dropdown-options")
    this.filterInput=this.dropdown.querySelector(".dropdown-filter")
    this.selectId=this.trigger.dataset.select;this.nativeSelect=document.getElementById(this.selectId)
    this.isOpen=false
    this.trigger.addEventListener("click",e=>{e.stopPropagation();this.toggle()})
    document.addEventListener("click",e=>{if(!this.wrap.contains(e.target))this.close()})
    document.addEventListener("keydown",e=>{if(e.key==="Escape")this.close()})
    if(this.filterInput){
      this.filterInput.addEventListener("input",()=>this.filter())
      this.filterInput.addEventListener("keydown",e=>{
        if(e.key==="Enter"){const v=this.optionsContainer.querySelectorAll(".dropdown-option:not(.hidden)");if(v.length>0){this.selectValue(v[0].dataset.value);this.close()}}
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();this.navigate(e.key==="ArrowDown"?1:-1)}
      })
    }
    this.nativeSelect.addEventListener("change",()=>this.sync())
    this.sync();this.buildOptions();allDropdowns.push(this)
  }
  get values(){return Array.from(this.nativeSelect.options).map(o=>({value:o.value,label:o.textContent}))}
  buildOptions(){
    this.optionsContainer.innerHTML=""
    for(const o of this.values){
      const d=document.createElement("div")
      d.className="dropdown-option"+(o.value===this.selectedValue?" selected":"")
      d.dataset.value=o.value
      d.innerHTML=(o.value?"<span class='option-icon'>▹</span>":"")+"<span>"+o.label+"</span>"
      d.addEventListener("click",()=>{this.selectValue(o.value);this.close()})
      this.optionsContainer.appendChild(d)
    }
  }
  get selectedValue(){return this.nativeSelect.value}
  sync(){
    const v=this.nativeSelect.value
    const l=this.nativeSelect.options[this.nativeSelect.selectedIndex]?.textContent||"Select..."
    const ve=this.trigger.querySelector(".trigger-value");if(ve)ve.textContent=l
    this.optionsContainer.querySelectorAll(".dropdown-option").forEach(e=>e.classList.toggle("selected",e.dataset.value===v))
  }
  selectValue(v){this.nativeSelect.value=v;this.nativeSelect.dispatchEvent(new Event("change",{bubbles:true}))}
  toggle(){this.isOpen?this.close():this.open()}
  open(){
    if(this.isOpen)return
    allDropdowns.forEach(d=>{if(d!==this)d.close()})
    this.isOpen=true;this.trigger.classList.add("open");this.dropdown.classList.add("open")
    if(this.filterInput){this.filterInput.value="";this.filter();setTimeout(()=>this.filterInput.focus(),50)}
  }
  close(){if(!this.isOpen)return;this.isOpen=false;this.trigger.classList.remove("open");this.dropdown.classList.remove("open")}
  filter(){
    const q=(this.filterInput?.value||"").toLowerCase()
    this.optionsContainer.querySelectorAll(".dropdown-option").forEach(e=>{
      const m=!q||(e.textContent||"").toLowerCase().includes(q)
      e.style.display=m?"":"none"
    })
  }
  navigate(dir){
    const v=Array.from(this.optionsContainer.querySelectorAll(".dropdown-option:not([style*='display: none'])"))
    if(!v.length)return
    const c=v.findIndex(e=>e.classList.contains("focused"))
    const n=Math.max(0,Math.min(v.length-1,c+dir))
    v.forEach(e=>e.classList.remove("focused"));v[n].classList.add("focused");v[n].scrollIntoView({block:"nearest"})
  }
  updateOptions(){this.buildOptions()}
}

const chatModelDropdown=new CustomDropdown(S("#chat-model-select-wrap"))
const chatReasoningDropdown=new CustomDropdown(S("#chat-reasoning-select-wrap"))

// SSE
let cleanupSSE=null
function initSSE(){if(cleanupSSE)cleanupSSE();cleanupSSE=API.onSSEEvent(handleSSEEvent)}

let partTexts={},partTypes={},partMsgs={},reasoningParts={},toolParts={},lastDeltaTime=Date.now(),streamTimeout=null

function handleSSEEvent(data){
  const t=data.type,p=data.properties||{}
  if(t==="server.connected"){state.connected=true;updateStatus();showToast("Connected")}
  if(t==="message.updated"){const i=p.info||{};if(i.role==="assistant"&&i.id&&state.isStreaming)state.assistantMsgId=i.id}
  if(t==="message.part.updated"){
    const part=p.part||{},pid=part.id,ptype=part.type,msgId=part.messageID,text=part.text||""
    if(pid){partTypes[pid]=ptype;partMsgs[pid]=msgId||partMsgs[pid]||"";if(text)partTexts[pid]=text
      if(ptype==="reasoning"){reasoningParts[pid]=text;rebuildReasoning()}
      else if(ptype==="text"&&partMsgs[pid]===state.assistantMsgId)rebuildStreamText()}
  }
  if(t==="message.part.delta"){
    const pid=p.partID,field=p.field,delta=p.delta||""
    if(field==="text"&&pid){
      partTexts[pid]=(partTexts[pid]||"")+delta;lastDeltaTime=Date.now()
      clearTimeout(streamTimeout);streamTimeout=setTimeout(()=>{if(state.isStreaming)forceEndStream()},12000)
      if(partTypes[pid]==="reasoning"){reasoningParts[pid]=partTexts[pid];rebuildReasoning()}
      else if(partTypes[pid]==="text"&&partMsgs[pid]===state.assistantMsgId)rebuildStreamText()
    }
  }
  if(t==="session.status"||t==="session.idle"){
    const sid=p.sessionID||""
    if(p.status?.type==="idle"||t==="session.idle"){
      if((!sid||sid===state.currentSessionId)&&state.isStreaming)finishStreaming()
    }
  }
}

function finishStreaming(){
  clearTimeout(streamTimeout)
  if(state.streamingText)appendMessage("assistant",state.streamingText,false)
  clearStreamingMarkers()
  endStreaming()
}
function clearStreamingMarkers(){
  const rb=document.querySelector(".reasoning-block.streaming")
  if(rb){rb.classList.remove("streaming");const to=rb.querySelector(".reasoning-toggle"),co=rb.querySelector(".reasoning-content")
    if(to)to.classList.remove("open");if(co)co.classList.remove("open")}
}
function forceEndStream(){if(state.isStreaming){if(state.streamingText)appendMessage("assistant",state.streamingText,false);clearStreamingMarkers();endStreaming();showToast("Timed out",4000)}}
function endStreaming(){
  clearTimeout(streamTimeout)
  state.isStreaming=false;state.streamingText="";state.assistantMsgId=""
  partTexts={};partTypes={};partMsgs={};reasoningParts={};toolParts={}
  chatInput.disabled=false;chatInput.focus();updateSendBtn();scrollToBottom()
}
function rebuildStreamText(){
  if(!state.isStreaming)return
  const t=[];for(const[pid,txt]of Object.entries(partTexts)){if(partTypes[pid]==="text"&&partMsgs[pid]===state.assistantMsgId)t.push(txt)}
  const n=t.join("");if(n!==state.streamingText){state.streamingText=n;updateStreamingMsg(n)}
}
function rebuildReasoning(){if(!state.isStreaming)return;const t=[];for(const[pid,txt]of Object.entries(reasoningParts)){if(partMsgs[pid]===state.assistantMsgId)t.push(txt)};updateReasoning(t.join(""))}
function rebuildTools(){toolParts={}}

function updateStatus(){
  const c=state.connected?"connected":"disconnected"
  statusDot.className="status-dot "+c;statusText.textContent=state.connected?"Ready":"Disconnected"
}

// Sessions
async function loadSessions(){
  const d=await api("GET","/session")
  if(d&&Array.isArray(d)){state.sessions=d;renderSessions()}
}
function renderSessions(filter){
  const items=filter?state.sessions.filter(s=>(s.title||s.id).toLowerCase().includes(filter.toLowerCase())):state.sessions
  sessionList.innerHTML=items.map(s=>{
    const t=state.tempSessions.has(s.id)
    return'<div class="session-item'+(s.id===state.currentSessionId?" active":"")+(t?" temp":"")+'" data-id="'+s.id+'"><span class="session-title">'+(s.title||s.id.slice(0,20))+'</span><button class="session-delete" data-id="'+s.id+'">✕</button></div>'
  }).join("")
  sessionList.querySelectorAll(".session-item").forEach(el=>{el.addEventListener("click",e=>{if(e.target.classList.contains("session-delete"))return;switchSession(el.dataset.id)})})
  sessionList.querySelectorAll(".session-delete").forEach(btn=>{btn.addEventListener("click",e=>{e.stopPropagation();confirmDelete(btn.dataset.id)})})
}

// Inline rename
sessionList.addEventListener("dblclick",e=>{
  const t=e.target.closest(".session-title");if(!t)return
  const item=t.closest(".session-item");if(!item)return
  const id=item.dataset.id,s=state.sessions.find(x=>x.id===id);if(!s)return
  const cur=s.title||id.slice(0,20)
  const inp=document.createElement("input");inp.type="text";inp.className="session-rename-input";inp.value=cur;inp.maxLength=100
  t.replaceWith(inp);inp.focus();inp.select()
  const fin=async save=>{if(save){const n=inp.value.trim();if(n&&n!==cur){await renameSession(id,n);s.title=n}};renderSessions(sessionSearch.value.trim())}
  inp.addEventListener("blur",()=>fin(true))
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();inp.blur()}if(e.key==="Escape"){e.preventDefault();fin(false)}})
})

sessionSearch.addEventListener("input",()=>{renderSessions(sessionSearch.value.trim())})

async function switchSession(id){
  if(id===state.currentSessionId)return
  const prev=state.currentSessionId
  if(prev&&state.tempSessions.has(prev)){await deleteSession(prev);state.sessions=state.sessions.filter(s=>s.id!==prev);state.tempSessions.delete(prev)}
  else await deleteIfEmpty(prev)
  state.currentSessionId=id;renderSessions(sessionSearch.value.trim());await loadMessages()
}
async function deleteIfEmpty(id){if(!id)return;const c=await getMessageCount(id);if(c===0){await deleteSession(id);state.sessions=state.sessions.filter(s=>s.id!==id);state.tempSessions.delete(id);if(state.currentSessionId===id)state.currentSessionId=null;renderSessions(sessionSearch.value.trim())}}
let _pendingDeleteId=null,_pendingDeleteTimer=null
async function confirmDelete(id){
  if(_pendingDeleteId===id){clearTimeout(_pendingDeleteTimer);_pendingDeleteId=null;_pendingDeleteTimer=null;await doDelete(id)}
  else{_pendingDeleteId=id;showToast("Click again to delete",3000);_pendingDeleteTimer=setTimeout(()=>{_pendingDeleteId=null},3000)}
}
async function doDelete(id){
  await deleteSession(id);state.sessions=state.sessions.filter(s=>s.id!==id);state.tempSessions.delete(id)
  if(state.currentSessionId===id){
    state.currentSessionId=state.sessions.length>0?state.sessions[0].id:null
    if(state.currentSessionId)await loadMessages();else showWelcome()
  }
  renderSessions(sessionSearch.value.trim());showToast("Deleted")
}
async function newSession(){
  if(state.currentSessionId&&!state.isStreaming){const c=await getMessageCount(state.currentSessionId);if(c===0){showToast("Current chat is empty");return}}
  const isTemp=tempToggle.checked,title=isTemp?"Temp Chat ⚡":"New Chat",icon=isTemp?"⚡":"◆",heading=isTemp?"Temp Chat":"New Chat",desc=isTemp?"Ephemeral - deleted when you leave.":"Start a new conversation."
  const r=await api("POST","/session",{title})
  if(r&&r.id){state.currentSessionId=r.id;if(isTemp)state.tempSessions.add(r.id);state.messages=[];state.streamingText=""
    messagesContainer.innerHTML='<div class="welcome"><div class="welcome-icon">'+icon+'</div><h1>'+heading+'</h1><p>'+desc+'</p></div>'
    await loadSessions();showToast(isTemp?"Temporary chat started":"New chat created")}
}

// Messages
async function loadMessages(){
  if(!state.currentSessionId){showWelcome();return}
  const d=await api("GET","/session/"+state.currentSessionId+"/message")
  if(!d||!Array.isArray(d))return
  state.messages=[];messagesContainer.innerHTML=""
  for(const msg of d){
    const role=msg.info?.role,parts=msg.parts||[]
    const textParts=parts.filter(p=>p.type==="text"&&p.text),reasonParts=parts.filter(p=>p.type==="reasoning"&&p.text),toolPartsList=parts.filter(p=>p.type!=="text"&&p.type!=="reasoning")
    if(!textParts.length&&!reasonParts.length){if(role)state.messages.push({role,content:""});continue}
    const g=document.createElement("div");g.className="message-group"
    for(const rp of reasonParts){
      const b=document.createElement("div");b.className="reasoning-block"
      b.innerHTML='<button class="reasoning-toggle"><span class="toggle-icon">▸</span><span class="toggle-label">Thinking</span></button><div class="reasoning-content">'+rp.text+'</div>'
      b.querySelector(".reasoning-toggle").addEventListener("click",()=>{b.querySelector(".reasoning-toggle").classList.toggle("open");b.querySelector(".reasoning-content").classList.toggle("open")})
      g.appendChild(b)
    }
    for(const tp of textParts){
      state.messages.push({role,content:tp.text})
      const m=document.createElement("div");m.className="message "+role
      const h=document.createElement("div");h.className="message-header";h.textContent=role==="user"?"You":"EUT-GPT";m.appendChild(h)
      const c=document.createElement("div");c.className="message-content"
      if(role==="user")c.textContent=tp.text
       else c.innerHTML=tp.text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/```(\w*)\n([\s\S]*?)```/g,"<pre><code>$2</code></pre>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/\n/g,"<br>")
      m.appendChild(c);g.appendChild(m)
    }
    messagesContainer.appendChild(g)
  }
  if(!state.messages.length)showWelcome();scrollToBottom()
}
function showWelcome(){
  const t=state.currentSessionId&&state.tempSessions.has(state.currentSessionId)
  messagesContainer.innerHTML='<div class="welcome"><div class="welcome-icon">'+(t?"⚡":"◆")+'</div><h1>'+(t?"Temp Chat":"EUT-GPT")+'</h1><p>'+(t?"Ephemeral session.":"Your intelligent coding assistant.")+'</p></div>'
}
function appendMessage(role,content,isStreaming){
  const w=messagesContainer.querySelector(".welcome");if(w)w.remove()
  const e=messagesContainer.querySelector(".message.streaming");if(e)e.remove()
  const m=document.createElement("div");m.className="message "+role+(isStreaming?" streaming":"")
  const h=document.createElement("div");h.className="message-header";h.textContent=role==="user"?"You":"EUT-GPT";m.appendChild(h)
  const c=document.createElement("div");c.className="message-content"
   if(!isStreaming&&role==="assistant")c.innerHTML=content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/```(\w*)\n([\s\S]*?)```/g,"<pre><code>$2</code></pre>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/\n/g,"<br>")
  else c.textContent=content
  m.appendChild(c)
  if(isStreaming){const d=document.createElement("div");d.className="typing-indicator";d.innerHTML="<span class='dot'></span><span class='dot'></span><span class='dot'></span>";m.appendChild(d)}
  const g=document.createElement("div");g.className="message-group";g.appendChild(m);messagesContainer.appendChild(g);scrollToBottom()
}
function updateStreamingMsg(text){let m=messagesContainer.querySelector(".message.streaming");if(!m){appendMessage("assistant",text,true);m=messagesContainer.querySelector(".message.streaming")}if(m){const c=m.querySelector(".message-content");if(c)c.textContent=text;scrollToBottom()}}
function appendReasoning(text,streaming){
  let b=messagesContainer.querySelector(".reasoning-block.streaming")
  if(!b){b=document.createElement("div");b.className="reasoning-block"+(streaming?" streaming":"");b.innerHTML='<button class="reasoning-toggle"><span class="toggle-icon">▸</span><span class="toggle-label">Thinking</span></button><div class="reasoning-content">'+(streaming?text:"")+'</div>'
    const sm=messagesContainer.querySelector(".message.streaming");const sg=sm?sm.closest(".message-group"):null
    if(sg)messagesContainer.insertBefore(b,sg);else messagesContainer.appendChild(b)
    b.querySelector(".reasoning-toggle").addEventListener("click",()=>{b.querySelector(".reasoning-toggle").classList.toggle("open");b.querySelector(".reasoning-content").classList.toggle("open")});scrollToBottom()}
  else{const c=b.querySelector(".reasoning-content");if(c)c.textContent=text}
}
function updateReasoning(text){appendReasoning(text,true)}
function appendTool(part){}
function scrollToBottom(){requestAnimationFrame(()=>{messagesContainer.scrollTop=messagesContainer.scrollHeight})}
function addMessageFooter(content,elapsed){
  const mg=messagesContainer.querySelector(".message-group:last-child")
  if(!mg)return
  const ef=state._lastEffort||"none",mdl=state._lastModel||"?"
  const modelShort=mdl.includes("/")?mdl.split("/")[1]:mdl
  const mt=document.createElement("div");mt.className="message-footer"
  mt.innerHTML="<span class='msg-footer-model'>"+modelShort+"</span><span class='msg-footer-divider'>·</span><span class='msg-footer-effort'>"+ef+"</span><span class='msg-footer-divider'>·</span><span class='msg-footer-time'>"+elapsed+"s</span>"
  mg.appendChild(mt)
}


// Send
async function sendMessage(){
  const text=chatInput.value.trim();if(!text||state.isStreaming||state._sending)return
  if(!chatModelSelect.value){showToast("Select a model first");return}
  if(!state.currentSessionId){await newSession();return}
  state._sending=true;chatInput.value="";chatInput.style.height="auto";chatInput.disabled=true
  appendMessage("user",text,false);state.messages.push({role:"user",content:text})
  state.isStreaming=true;state.streamingText="";state.assistantMsgId=""
  partTexts={};partTypes={};partMsgs={};reasoningParts={};toolParts={};lastDeltaTime=Date.now();updateSendBtn()
  state._requestStartTime=Date.now()
  state._lastModel=state.currentModel||chatModelSelect.value
  state._lastEffort=state.reasoningEffort||"none"
  const body={parts:[{type:"text",text}]}
  if(state.systemPrompt)body.system=state.systemPrompt
  if(state.currentModel||chatModelSelect.value){
    const mn=state.currentModel||chatModelSelect.value,mp=mn.split("/")
    if(mp.length===2)body.model={providerID:mp[0],modelID:mp[1]}
  }
  try{
    const r=await promptAsync("/session/"+state.currentSessionId+"/prompt_async",body)
    if(r?.error){endStreaming();showToast("Error",4000);state._sending=false;return}
    let waited=0
    while(state.isStreaming&&waited<600){await new Promise(r=>setTimeout(r,100));waited++;if(Date.now()-lastDeltaTime>15000&&waited>50){forceEndStream();break}}
    const elapsed=((Date.now()-state._requestStartTime)/1000).toFixed(1)
    const lastMsg=messagesContainer.querySelector(".message-group:last-child .message.assistant .message-content")
    if(lastMsg)addMessageFooter(lastMsg.textContent,elapsed)
    // Auto-name
    if(state.currentSessionId){const s=state.sessions.find(x=>x.id===state.currentSessionId);if(s){const def=!s.title||s.title==="New Chat"||s.title.startsWith("Temp Chat");if(def){const nt=text.slice(0,42).replace(/\s+/g," ").trim()+(text.length>42?"...":"");if(nt){await renameSession(state.currentSessionId,nt);s.title=nt;renderSessions(sessionSearch.value.trim())}}}}
  }catch(e){console.error(e);endStreaming();showToast("Connection error",4000)}
  state._sending=false
}
function updateSendBtn(){
  const ok=chatModelSelect.value
  sendBtn.disabled=state.isStreaming||!ok
}
chatInput.addEventListener("input",()=>{chatInput.style.height="auto";chatInput.style.height=Math.min(chatInput.scrollHeight,120)+"px"})
chatInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}})
sendBtn.addEventListener("click",e=>{e.preventDefault();sendMessage()})
newChatBtn.addEventListener("click",newSession)

// Models
async function loadModels(){
  const d=await api("GET","/config/providers");if(!d||!d.providers)return
  state.models=[];state.modelVariants={}
  for(const p of d.providers){const pid=p.id,models=p.models||{};for(const[mid,mdata]of Object.entries(models)){const n=mdata.id||mid,full=pid+"/"+n;state.models.push(full);state.modelVariants[full]=Object.keys(mdata.variants||{})}}
  renderModels()
}
function renderModels(){
  const cv=chatModelSelect.value;chatModelSelect.innerHTML=''
  state.models.forEach(m=>{const o=document.createElement("option");o.value=m;o.textContent=m;chatModelSelect.appendChild(o)})
  if(cv&&state.models.includes(cv))chatModelSelect.value=cv
  else if(state.models.length>0){chatModelSelect.value=state.models[0];state.currentModel=state.models[0];api("PATCH","/config",{model:state.models[0]})}
  chatModelDropdown.updateOptions();updateEffort();updateSendBtn()
}
function getVariantForEffort(model, level){
  if(!level||!model)return null
  const vs=state.modelVariants[model]||[]
  for(const v of vs){if(v.toLowerCase()===level.toLowerCase())return v}
  for(const v of vs){if(v.toLowerCase().includes(level.toLowerCase()))return v}
  return vs[0]||null
}
function hasVariantForLevel(model, level){
  if(!level||!model)return false
  const vs=state.modelVariants[model]||[]
  for(const v of vs){if(v.toLowerCase()===level.toLowerCase())return true}
  for(const v of vs){if(v.toLowerCase().includes(level.toLowerCase()))return true}
  return false
}
function updateEffort(){
  const s=chatModelSelect.value
  chatReasoningSelect.innerHTML=''
  const def=document.createElement("option");def.value="";def.textContent="None";chatReasoningSelect.appendChild(def)
  EFFORT_LEVELS.forEach(l=>{if(hasVariantForLevel(s,l)){const o=document.createElement("option");o.value=l;o.textContent=l.charAt(0).toUpperCase()+l.slice(1);chatReasoningSelect.appendChild(o)}})
  if(state.reasoningEffort&&EFFORT_LEVELS.includes(state.reasoningEffort)){chatReasoningSelect.value=state.reasoningEffort}
  else if(EFFORT_LEVELS.length>0){const d=chatReasoningSelect.querySelector("option[value]");if(d){chatReasoningSelect.value=d.value;state.reasoningEffort=d.value}}
  chatReasoningDropdown.updateOptions();updateSendBtn()
}
chatModelSelect.addEventListener("change",()=>{state.currentModel=chatModelSelect.value;updateEffort();chatReasoningDropdown.sync();if(state.currentModel)api("PATCH","/config",{model:state.currentModel})})
chatReasoningSelect.addEventListener("change",()=>{state.reasoningEffort=chatReasoningSelect.value;updateSendBtn()})

// Settings
settingsBtn.addEventListener("click",()=>{settingsTemp.value=state.temperature;tempValue.textContent=state.temperature;updateFill();settingsUrl.value="http://127.0.0.1:4096";settingsOverlay.style.display="flex"})
closeSettings.addEventListener("click",()=>{settingsOverlay.style.display="none"})
cancelSettings.addEventListener("click",()=>{settingsOverlay.style.display="none"})
settingsOverlay.addEventListener("click",e=>{if(e.target===settingsOverlay)settingsOverlay.style.display="none"})
settingsTemp.addEventListener("input",()=>{state.temperature=parseFloat(settingsTemp.value);tempValue.textContent=state.temperature;updateFill()})
function updateFill(){const v=(parseFloat(settingsTemp.value)-0)/(2-0);rangeFill.style.width=(v*100)+"%"}
saveSettings.addEventListener("click",()=>{settingsOverlay.style.display="none";showToast("Settings saved")})

// Keyboard
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="n"){e.preventDefault();newSession()}if((e.metaKey||e.ctrlKey)&&e.key===","){e.preventDefault();settingsBtn.click()}if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();sessionSearch.focus()}})

// Init
async function init(){
  loadTheme();updateVersionDisplay();initSSE();updateStatus();updateFill()
  await loadModels();await loadSessions()
  for(const s of state.sessions){const c=await getMessageCount(s.id);if(c===0&&s.id!==state.currentSessionId)await deleteSession(s.id)}
  await loadSessions()
  if(state.sessions.length>0){state.currentSessionId=state.sessions[0].id;renderSessions();await loadMessages()}
  else await newSession()
  const config=await api("GET","/config")
  if(config?.model){
    const m=config.model
    if(m.includes("@")){const[b,v]=m.split("@");state.currentModel=b;state.reasoningEffort=v}else state.currentModel=m
    if(state.currentModel&&state.models.includes(state.currentModel)){
      chatModelSelect.value=state.currentModel;chatModelDropdown.sync();updateEffort()
      if(state.reasoningEffort&&EFFORT_LEVELS.includes(state.reasoningEffort)){
        chatReasoningSelect.value=state.reasoningEffort;chatReasoningDropdown.sync()
      }else{state.reasoningEffort=chatReasoningSelect.value}
    }
  }
  if(!config?.system||!config.system.includes("STRICTLY LIMITED")){
    state.systemPrompt=STRICT_SYSTEM_PROMPT
    await api("PATCH","/config",{system:STRICT_SYSTEM_PROMPT})
  }else{state.systemPrompt=config.system}
  state.connected=true;updateStatus();updateSendBtn()
}
document.addEventListener("DOMContentLoaded",init)
