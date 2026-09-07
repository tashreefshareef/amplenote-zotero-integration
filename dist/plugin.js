(() => {
  // Amplenote Zotero Integration - v0.1.0
  // GENERATED FILE - do not edit. Edit src/ and run `npm run build`.
var __pluginModule=(()=>{var Q=Object.defineProperty;var vt=Object.getOwnPropertyDescriptor;var Lt=Object.getOwnPropertyNames;var Dt=Object.prototype.hasOwnProperty;var Ft=(t,e)=>{for(var n in e)Q(t,n,{get:e[n],enumerable:!0})},Ht=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of Lt(e))!Dt.call(t,o)&&o!==n&&Q(t,o,{get:()=>e[o],enumerable:!(r=vt(e,o))||r.enumerable});return t};var Ut=t=>Ht(Q({},"__esModule",{value:!0}),t);var oe={};Ft(oe,{default:()=>re});var j="https://api.zotero.org",st="3",b="Zotero API key",B="Zotero sync filter",O="chicago-note-bibliography",V="Zotero citation style",ct="Zotero citation format",H="Zotero Sync",R="Zotero Sync State",Y="Reference",J="Zotero Notes",q="Highlights & Notes",lt="My Notes";function ut(t){return t.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ")}function U(t){return t?ut(t.replace(/<[^>]*>/g,"")).replace(/\s+/g," ").trim():""}function ft(t){if(!t)return"";let e=t.replace(/<br\s*\/?>/gi,`
`).replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi,`
`);return ut(e.replace(/<[^>]*>/g,"")).split(`
`).map(n=>n.replace(/[ \t]+/g," ").trim()).filter(Boolean).join(`
`)}function dt(t,e=80){return!t||t.length<=e?t||"":`${t.slice(0,e-1).trimEnd()}\u2026`}function mt(t){return{key:t.key,version:t.version,title:t.data?.title||"(untitled)",abstract:t.data?.abstractNote||"",tags:(t.data?.tags||[]).map(e=>e.tag),citation:U(t.citation),bib:U(t.bib),url:t.links?.alternate?.href||null}}var v=class extends Error{constructor(e,n){super(`Zotero API error: HTTP ${e}`),this.name="ZoteroApiError",this.status=e,this.body=n}},L=class extends Error{constructor(e,n){super(`Zotero API rate limited: HTTP ${e}, retry after ${n}s`),this.name="ZoteroRateLimitedError",this.status=e,this.retryAfterSeconds=n}};function D(t,{style:e}={}){return t instanceof L?`Zotero rate-limited this request \u2014 retry in ${t.retryAfterSeconds}s.`:t instanceof v?t.status===403?"Zotero rejected the API key (HTTP 403). Check it's current and still has library access.":e&&e!==O&&t.status>=500?`Zotero couldn't render the citation (HTTP ${t.status}). Is "${e}" a valid Zotero style id? That's what this status usually means.`:t.status>=500?`Zotero's server errored (HTTP ${t.status}). Worth retrying in a moment.`:`Zotero API error (HTTP ${t.status}).`:`Could not reach Zotero: ${t.message}`}var z=t=>t===null||t===""?null:Number(t);function Gt(t){if(!t)return{};let e={};for(let n of t.split(",")){let r=n.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);r&&(e[r[2]]=r[1])}return e}var Mt=t=>new Promise(e=>setTimeout(e,t*1e3));function N({apiKey:t,userID:e,fetchImpl:n=typeof fetch=="function"?fetch:void 0,sleepImpl:r=Mt}={}){if(!n)throw new Error("createZoteroClient: no fetch implementation available");async function o(s,{method:u="GET",params:h={},sinceVersion:I,ifModifiedSinceVersion:x}={}){let c=new URL(s,j);for(let[_,F]of Object.entries(h))F!=null&&c.searchParams.set(_,String(F));I!==void 0&&c.searchParams.set("since",String(I));let S={"Zotero-API-Version":st};t&&(S["Zotero-API-Key"]=t),x!==void 0&&(S["If-Unmodified-Since-Version"]=String(x));let d=await n(c,{method:u,headers:S}),$=d.headers.get("Backoff"),A=d.headers.get("Retry-After"),P=z($);if(d.status===429||d.status===503)throw new L(d.status,z(A)??P??1);if(!d.ok&&d.status!==304){let _;try{_=await d.text()}catch{_=null}throw new v(d.status,_)}return{status:d.status,notModified:d.status===304,data:d.status===304?null:await d.json(),lastModifiedVersion:z(d.headers.get("Last-Modified-Version")),totalResults:z(d.headers.get("Total-Results")),links:Gt(d.headers.get("Link")),backoffSeconds:P}}async function i(s,{params:u={},sinceVersion:h,pageSize:I=50}={}){let x=[],c=s,S={limit:I,...u},d=null;for(;c;){let $=await o(c,{params:S,sinceVersion:h});x.push(...$.data),d=$.lastModifiedVersion,$.backoffSeconds&&await r($.backoffSeconds),c=$.links.next??null,S={},h=void 0}return{items:x,lastModifiedVersion:d}}async function a(){return(await o("/keys/current")).data}let f=e??null,l=null;async function p(){return f!==null?f:(l||(l=a().then(s=>(f=s.userID,l=null,f))),l)}async function T({query:s,style:u=O,limit:h=25}={}){let I=await p();return(await o(`/users/${I}/items/top`,{params:{q:s,qmode:"titleCreatorYear",itemType:"-attachment",include:"data,citation,bib",style:u,limit:h}})).data.map(c=>({key:c.key,title:c.data?.title||"(untitled)",citation:U(c.citation),bib:U(c.bib),citationKey:c.data?.citationKey||"",creators:c.data?.creators||[],date:c.data?.date||""}))}async function C({sinceVersion:s,style:u=O,pageSize:h=50}={}){let I=await p(),{items:x,lastModifiedVersion:c}=await i(`/users/${I}/items/top`,{params:{itemType:"-attachment",include:"data,citation,bib",style:u},sinceVersion:s,pageSize:h});return{lastModifiedVersion:c,items:x.map(mt)}}async function g(){let s=await p(),{items:u}=await i(`/users/${s}/collections`,{params:{include:"data"}});return u.map(h=>({key:h.key,name:h.data?.name||"(untitled collection)"}))}async function y(){let s=await p(),{items:u}=await i(`/users/${s}/tags`);return[...new Set(u.map(h=>h.tag).filter(Boolean))].sort()}async function k(){let{items:s}=await i("/itemTypes");return s.filter(u=>u.itemType!=="attachment"&&u.itemType!=="note").map(u=>({itemType:u.itemType,name:u.localized||u.itemType}))}async function K({sinceVersion:s,collectionKeys:u=[],tagNames:h=[],itemTypes:I=[],style:x=O,pageSize:c=50}={}){let S=await p(),d={itemType:"-attachment",include:"data,citation,bib",style:x},$=new Map,A=null,P=async(_,F)=>{let X=await i(_,{params:F,sinceVersion:s,pageSize:c});X.lastModifiedVersion!==null&&(A=Math.max(A??0,X.lastModifiedVersion));for(let at of X.items)$.set(at.key,at)};for(let _ of u)await P(`/users/${S}/collections/${_}/items/top`,d);return h.length&&await P(`/users/${S}/items/top`,{...d,tag:h.join(" || ")}),I.length&&await P(`/users/${S}/items/top`,{include:"data,citation,bib",style:x,itemType:I.join(" || ")}),{lastModifiedVersion:A,items:[...$.values()].map(mt)}}async function m(s){let u=await p(),{items:h}=await i(`/users/${u}/items/${s}/children`,{params:{include:"data"}});return h}async function E(s){let u=await m(s),h=u.filter(c=>c.data?.itemType==="attachment"),I=[];for(let c of h){let S=await m(c.key);for(let d of S){if(d.data?.itemType!=="annotation")continue;let $=null;try{let A=JSON.parse(d.data.annotationPosition||"{}");Number.isInteger(A.pageIndex)&&($=A.pageIndex)}catch{}I.push({key:d.key,attachmentKey:c.key,type:d.data.annotationType||"",text:d.data.annotationText||"",comment:d.data.annotationComment||"",color:(d.data.annotationColor||"").toLowerCase(),pageLabel:d.data.annotationPageLabel||"",pageIndex:$,sortIndex:d.data.annotationSortIndex||""})}}I.sort((c,S)=>c.sortIndex.localeCompare(S.sortIndex));let x=u.filter(c=>c.data?.itemType==="note").map(c=>({key:c.key,text:ft(c.data.note||"")})).filter(c=>c.text);return{attachments:h.map(c=>({key:c.key,title:c.data?.title||"Attachment",url:c.links?.alternate?.href||null})),annotations:I,notes:x}}async function w(s){let u=await p();return{title:(await o(`/users/${u}/items/${s}`,{params:{include:"data"}})).data?.data?.title||"(untitled)"}}return{request:o,paginate:i,keysCurrent:a,searchItems:T,syncItems:C,getItemExtras:E,getItem:w,listCollections:g,listTags:y,listItemTypes:k,syncFilteredItems:K}}async function yt(t){let e=(t.settings[b]||"").trim();if(!e){await t.alert(`Set the "${b}" row in this plugin note's metadata table first.`);return}let n=N({apiKey:e});try{let{userID:r,username:o,access:i}=await n.keysCurrent(),a=i?.user?Object.entries(i.user).filter(([,f])=>f).map(([f])=>f).join(", ")||"none":"unknown";await t.alert(`Connected as ${o} (userID ${r}). Access: ${a}.`)}catch(r){r instanceof L?await t.alert(`Zotero rate-limited this request \u2014 retry in ${r.retryAfterSeconds}s.`):r instanceof v?await t.alert(`Zotero API key rejected (HTTP ${r.status}). Check the key is current.`):await t.alert(`Could not reach Zotero: ${r.message}`)}}var W=["formatted","bibliography","pandoc","latex","biblatex"];function et(t){let e=(t||"").trim().toLowerCase();return W.includes(e)?e:"formatted"}function Kt(t){return(t||"").normalize("NFKD").replace(/[^\x00-\x7F]/g,"").replace(/[^a-z0-9]/gi,"").toLowerCase()}function tt(t){if(t.citationKey)return t.citationKey;let e=(t.creators||[]).find(o=>o.lastName||o.name),n=Kt(e?e.lastName||e.name:(t.title||"").split(/\s+/)[0]),r=((t.date||"").match(/\d{4}/)||[""])[0];return`${n}${r}`||t.key}function ht(t,e){switch(et(e)){case"bibliography":return t.bib||t.citation;case"pandoc":return`[@${tt(t)}]`;case"latex":return`\\cite{${tt(t)}}`;case"biblatex":return`\\autocite{${tt(t)}}`;default:return t.citation}}function nt(t){return Array.isArray(t)?t[0]:t}function jt(t,e){switch(t){case"bibliography":return"Bibliography entry";case"pandoc":return"Pandoc  [@key]";case"latex":return"LaTeX  \\cite{key}";case"biblatex":return"BibLaTeX  \\autocite{key}";default:return`Formatted citation (${e})`}}async function gt(t){let e=(t.settings[b]||"").trim();if(!e)return await t.alert(`Set the "${b}" row in this plugin note's metadata table first.`),null;let n=(t.settings[V]||"").trim()||O,r=(t.settings[ct]||"").trim().toLowerCase(),o=W.includes(r)?r:null,i=await t.prompt("Search Zotero",{inputs:[{label:"Search",type:"string"}]});if(i===null)return null;let a=(nt(i)||"").trim();if(!a)return null;let f=N({apiKey:e}),l;try{l=await f.searchItems({query:a,style:n})}catch(g){return await t.alert(D(g,{style:n})),null}if(!l.length)return await t.alert(`No Zotero items matched "${a}".`),null;let p=await t.prompt(`Results for "${a}"`,{inputs:[{label:"Reference",type:"select",options:l.map(g=>({label:dt(g.citation||g.title),value:g.key}))}]});if(p===null)return null;let T=l.find(g=>g.key===nt(p));if(!T)return null;let C=o;if(!C){let g=await t.prompt("Insert as",{inputs:[{label:"Format",type:"select",options:W.map(y=>({label:jt(y,n),value:y}))}]});if(g===null)return null;C=et(nt(g))}return{...T,format:C,text:ht(T,C)}}async function pt(t){let e=await gt(t);return e?e.text:""}async function wt(t){let e=await gt(t);e&&(await t.insertNoteContent({uuid:t.context.noteUUID},`${e.text}
`,{atEnd:!0}),await t.alert(`Appended: ${e.text}`))}function G(t,e){return t.split(`
`).filter(n=>/^#{1,6}\s/.test(n)&&n.replace(/^#{1,6}\s+/,"").trim()===e).length}function bt(t,e){let n=t.split(`
`),r=n.findIndex(i=>/^#{1,6}\s/.test(i)&&i.replace(/^#{1,6}\s+/,"").trim()===e);if(r===-1)return null;let o=n.length;for(let i=r+1;i<n.length;i++)if(/^#{1,6}\s/.test(n[i])){o=i;break}return n.slice(r+1,o).join(`
`)}async function Z(t,e,n,r,{headingLevel:o="#",noteLabel:i=e}={}){let a=await t.getNoteContent({uuid:e});if(a==null)throw new Error(`${i} (uuid ${e}) could not be read \u2014 it may no longer exist.`);let f=G(a,n);if(f>1)throw new Error(`${i} has ${f} "${n}" sections \u2014 delete the extra one before syncing again.`);if(f===0){await t.insertNoteContent({uuid:e},`
${o} ${n}
${r}`,{atEnd:!0});return}await t.replaceNoteContent({uuid:e},r,{section:{heading:{text:n}}})}function Bt(t){let e=t.match(/```(?:json)?\n([\s\S]*?)\n```/);return e?e[1]:null}function Vt(t){return`
Do not edit by hand \u2014 this section stores this plugin's sync bookkeeping as JSON.

\`\`\`json
${JSON.stringify({libraryVersion:t.libraryVersion,items:t.items,filterSignature:t.filterSignature},null,2)}
\`\`\`
`}async function Tt(t){let e=await t.findNote({name:H});if(!e)return{noteUUID:null,libraryVersion:null,items:{}};let n=await t.getNoteContent({uuid:e.uuid});if(n==null)return{noteUUID:e.uuid,libraryVersion:null,items:{}};let r=G(n,R);if(r>1)throw new Error(`The "${H}" note has ${r} "${R}" sections \u2014 delete the extra one before syncing again.`);let o=r===1?bt(n,R):null,i=o?Bt(o):null,a=null;if(i)try{a=JSON.parse(i)}catch{a=null}return{noteUUID:e.uuid,libraryVersion:a?.libraryVersion??null,items:a?.items??{},filterSignature:a?.filterSignature}}async function It(t,e){let n=Vt(e);if(!e.noteUUID){let r=await t.createNote(H);await t.insertNoteContent({uuid:r},`# ${R}
${n}`,{atEnd:!0}),e.noteUUID=r;return}await Z(t,e.noteUUID,R,n,{noteLabel:`The "${H}" note`})}function rt(t){return t.split(",").map(e=>e.trim()).filter(Boolean)}function Et(t){let e=[],n=[],r=[];for(let o of(t||"").split(`
`)){let i=o.match(/^\s*Collections?:\s*(.+)$/i),a=o.match(/^\s*Tags?:\s*(.+)$/i),f=o.match(/^\s*Categor(?:y|ies):\s*(.+)$/i);i?e.push(...rt(i[1])):a?n.push(...rt(a[1])):f&&r.push(...rt(f[1]))}return{collections:e,tags:n,categories:r}}function St({collections:t=[],tags:e=[],categories:n=[]}){let r=[];return t.length&&r.push(`Collections: ${t.join(", ")}`),e.length&&r.push(`Tags: ${e.join(", ")}`),n.length&&r.push(`Categories: ${n.join(", ")}`),r.join(`
`)}function xt(t){return JSON.stringify({collections:[...t.collections].sort(),tags:[...t.tags].sort(),categories:[...t.categories||[]].sort()})}function Yt(t){let e=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(t.trim());if(!e)return null;let n=parseInt(e[1],16)/255,r=parseInt(e[2],16)/255,o=parseInt(e[3],16)/255,i=Math.max(n,r,o),a=Math.min(n,r,o),f=(i+a)/2;if(i===a)return{h:0,s:0,l:f*100};let l=i-a,p=f>.5?l/(2-i-a):l/(i+a),T;return i===n?T=(r-o)/l+(r<o?6:0):i===r?T=(o-n)/l+2:T=(n-r)/l+4,{h:T*60,s:p*100,l:f*100}}function $t(t){let e=t?Yt(t):null;if(!e)return"";let{h:n,s:r,l:o}=e;return o<12?"Black":o>98?"White":r<2?"Gray":n<15?"Red":n<45?"Orange":n<65?"Yellow":n<170?"Green":n<190?"Cyan":n<255?"Blue":n<280?"Purple":n<335?"Magenta":"Red"}function Jt(t){if(!t.attachmentKey)return"";let e=Number.isInteger(t.pageIndex)?`?page=${t.pageIndex+1}`:"";return`[Open in Zotero](zotero://open-pdf/library/items/${t.attachmentKey}${e})`}async function qt(t,e,n,r){if(!e.collections.length&&!e.tags.length&&!e.categories.length)return t.syncItems({sinceVersion:n,style:r});let o=[];if(e.collections.length){let a=await t.listCollections(),f=e.collections.map(l=>l.toLowerCase());o=a.filter(l=>f.includes(l.name.toLowerCase())).map(l=>l.key)}let i=[];if(e.categories.length){let a=await t.listItemTypes(),f=e.categories.map(l=>l.toLowerCase());i=a.filter(l=>f.includes(l.name.toLowerCase())).map(l=>l.itemType)}return t.syncFilteredItems({sinceVersion:n,collectionKeys:o,tagNames:e.tags,itemTypes:i,style:r})}function zt(t){let e=t.pageLabel?` (p. ${t.pageLabel})`:"",n=$t(t.color),r=n?`**(${n})** `:"",o=Jt(t),i=o?` \u2014 ${o}`:"";if(t.text){let a=`> ${r}${t.text}${e}${i}
`;return t.comment?`${a}
_Comment: ${t.comment}_
`:a}return t.comment?`**Note${e}:** ${r}${t.comment}${i}
`:`_${t.type||"annotation"}${e}_${i}
`}function ot(t){return t.length?t.map(zt).join(`
`):`_No highlights or notes yet._
`}function _t(t,e){let n=[t.bib||t.citation||t.title];t.abstract&&n.push("",t.abstract),t.url&&n.push("",`[View in Zotero](${t.url})`);for(let r of e.attachments)r.url&&n.push("",`[View "${r.title}" in Zotero](${r.url})`);return n.join(`
`)+`
`}function it(t){return t.length?t.map(e=>e.text).join(`

`)+`
`:`_No Zotero notes._
`}var Wt=`_Anything you write in this section is yours \u2014 sync never touches it._
`;function Ct(t,e){return[`## ${Y}`,"",_t(t,e).trim(),"",`## ${J}`,"",it(e.notes).trim(),"",`## ${q}`,"",ot(e.annotations).trim(),"",`## ${lt}`,"",Wt.trim(),""].join(`
`)}var Xt={attachments:[],annotations:[],notes:[]};async function Qt(t,e){try{return await t.getItemExtras(e)}catch{return Xt}}async function Nt(t,e,n){if(await t.findNote({uuid:e.noteUUID}))return e.noteUUID;if(!n)return null;let r=await t.findNote({name:n});return r?(e.noteUUID=r.uuid,r.uuid):null}async function kt(t,e){let n=await t.getNoteContent({uuid:e});return!!n&&G(n,Y)>0}var M=t=>({headingLevel:"##",noteLabel:t});async function Ot(t){let e=(t.settings[b]||"").trim();if(!e){await t.alert(`Set the "${b}" row in this plugin note's metadata table first.`);return}let n;try{n=await Tt(t)}catch(m){await t.alert(m.message);return}let r=N({apiKey:e}),o=Et(t.settings[B]),i=xt(o),f=n.filterSignature!==void 0&&n.filterSignature!==i?void 0:n.libraryVersion??void 0,l=(t.settings[V]||"").trim()||O,p;try{p=await qt(r,o,f,l)}catch(m){await t.alert(D(m,{style:l}));return}let T=0,C=0,g=[],y=new Set;for(let m of p.items){y.add(m.key);let E=n.items[m.key];try{let w=await Qt(r,m.key);if(E){let s=await Nt(t,E,m.title);if(!s)throw new Error(`note ${E.noteUUID} no longer exists, and no note named "${m.title}" was found to recover it`);if(await kt(t,s)){let u=`"${m.title}"`;await Z(t,s,Y,_t(m,w),M(u)),await Z(t,s,J,it(w.notes),M(u)),await Z(t,s,q,ot(w.annotations),M(u))}else await t.replaceNoteContent({uuid:s},Ct(m,w));E.title=m.title,C++}else{let s=await t.createNote(m.title,m.tags);await t.insertNoteContent({uuid:s},Ct(m,w),{atEnd:!0}),n.items[m.key]={noteUUID:s,title:m.title},T++}}catch(w){g.push(`${m.title} (${w.message})`)}}let k=0;for(let[m,E]of Object.entries(n.items))if(!y.has(m))try{if(!E.title)try{E.title=(await r.getItem(m)).title}catch{}let w=await Nt(t,E,E.title);if(!w){let h=E.title?`, and no note named "${E.title}" was found to recover it`:"";throw new Error(`note ${E.noteUUID} no longer exists${h}`)}let s=await r.getItemExtras(m),u=`The note for Zotero item ${m}`;await kt(t,w)&&await Z(t,w,J,it(s.notes),M(u)),await Z(t,w,q,ot(s.annotations),M(u)),k++}catch(w){g.push(`highlights for ${m} (${w.message})`)}p.lastModifiedVersion!==null&&(n.libraryVersion=p.lastModifiedVersion),n.filterSignature=i;try{await It(t,n)}catch(m){await t.alert(m.message);return}let K=`Zotero sync complete: ${T} new, ${C} updated, ${k} highlights refreshed.`;await t.alert(g.length?`${K} ${g.length} failed: ${g.join("; ")}`:K)}async function At(t){let e=(t.settings[b]||"").trim();if(!e){await t.alert(`Set the "${b}" row in this plugin note's metadata table first.`);return}let n=N({apiKey:e}),r,o,i;try{[r,o,i]=await Promise.all([n.listCollections(),n.listTags(),n.listItemTypes()])}catch(y){await t.alert(D(y));return}if(!r.length&&!o.length&&!i.length){await t.alert("No collections, tags, or categories found in your Zotero library \u2014 nothing to filter by.");return}let a=[...r.map(y=>({label:`Collection: ${y.name}`,type:"checkbox"})),...o.map(y=>({label:`Tag: ${y}`,type:"checkbox"})),...i.map(y=>({label:`Category: ${y.name}`,type:"checkbox"}))],f=await t.prompt("Choose what to sync \u2014 leave everything unchecked to sync your whole library",{inputs:a});if(f===null)return;let l=Array.isArray(f)?f:[f],p=r.filter((y,k)=>l[k]).map(y=>y.name),T=o.filter((y,k)=>l[r.length+k]).map(y=>y),C=i.filter((y,k)=>l[r.length+o.length+k]).map(y=>y.name),g=St({collections:p,tags:T,categories:C});try{await t.setSetting(B,g)}catch(y){await t.alert(`Could not save the setting: ${y.message}`);return}await t.alert(g?`Sync will now be limited to:
${g}`:"No filter set \u2014 sync will pull your whole library.")}var te="Zotero PDF viewer spike";async function ee(t){let e=await t.keysCurrent().then(o=>o.userID),r=((await t.request(`/users/${e}/items`,{params:{itemType:"attachment",limit:100,include:"data"}})).data||[]).find(o=>o.data?.contentType==="application/pdf"&&String(o.data?.linkMode||"").startsWith("imported"));return r?{key:r.key,title:r.data.title||"(untitled)",uid:e}:null}async function Zt(t){let e=(t.settings[b]||"").trim();if(!e){await t.alert(`Set the "${b}" row first.`);return}let n=N({apiKey:e}),r;try{r=await ee(n)}catch(a){await t.alert(`Couldn't list attachments: ${a.message}`);return}if(!r){await t.alert("No stored PDF attachment found in your Zotero library \u2014 nothing to test with.");return}let o=await t.findNote({name:"Zotero Integration"});if(!o){await t.alert('Could not find a note named "Zotero Integration" to embed from.');return}let i=`<object data="plugin://${o.uuid}?spike=pdf&att=${r.key}" data-aspect-ratio="0.8" />`;await t.insertNoteContent({uuid:t.context.noteUUID},`
# ${te}

Testing with: ${r.title} (${r.key})

${i}
`,{atEnd:!0}),await t.alert(`Spike embed added at the end of this note, testing with "${r.title}".`)}async function Pt(t,e){let n;try{n=JSON.parse(e)}catch{return JSON.stringify({error:"bad payload"})}if(n.action!=="config")return JSON.stringify({error:`unknown action ${n.action}`});let r=(t.settings[b]||"").trim(),i=await N({apiKey:r}).keysCurrent().then(a=>a.userID);return JSON.stringify({apiKey:r,uid:i,base:j})}function Rt(t,e){let r=new URLSearchParams(e||"").get("att")||"";return`<!doctype html>
<meta charset="utf-8">
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 8px; color: #222; }
  h2 { font-size: 14px; margin: 0 0 6px; }
  .row { margin: 4px 0; padding: 4px 6px; border-left: 3px solid #ccc; background: #f7f7f7; }
  .ok { border-color: #2e7d32; } .bad { border-color: #c62828; } .wait { border-color: #999; }
  code { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
  iframe { width: 100%; height: 420px; border: 1px solid #bbb; margin-top: 8px; }
</style>
<h2>Zotero PDF viewer spike</h2>
<div id="out"></div>
<div id="frame"></div>
<script>
(function () {
  var out = document.getElementById("out");
  function say(id, cls, text) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; out.appendChild(el); }
    el.className = "row " + cls;
    el.innerHTML = text;
  }
  say("a", "wait", "A. Resolving presigned url\u2026");

  function probe(cfg) {
    var base = cfg.base, key = cfg.apiKey, uid = cfg.uid, att = ${JSON.stringify(r)};
    var viewUrl = base + "/users/" + uid + "/items/" + att + "/file/view/url";

    // A \u2014 does /file/view/url hand back a presigned url? api.zotero.org is CORS-open, so
    // reading this STRING should work even though reading the file's bytes doesn't.
    fetch(viewUrl, { headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" } })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .then(function (res) {
        if (res.status !== 200 || !/^https?:/.test(res.text.trim())) {
          say("a", "bad", "A. FAILED \u2014 /file/view/url returned HTTP " + res.status +
            ": <code>" + res.text.slice(0, 200) + "</code>");
          return;
        }
        var url = res.text.trim();
        say("a", "ok", "A. OK \u2014 presigned url returned (HTTP 200):<br><code>" + url.slice(0, 160) + "\u2026</code>");

        // B \u2014 iframe it. No CORS involved; this tests Amplenote's embed CSP frame-src.
        say("b", "wait", "B. Trying &lt;iframe&gt; of that url \u2014 if a PDF appears below, viewing works.");
        var f = document.createElement("iframe");
        f.src = url;
        f.onload = function () { say("b", "ok", "B. iframe fired onload \u2014 check below: is a PDF visible?"); };
        f.onerror = function () { say("b", "bad", "B. iframe errored."); };
        document.getElementById("frame").appendChild(f);
        setTimeout(function () {
          var el = document.getElementById("b");
          if (el && /Trying/.test(el.textContent)) {
            say("b", "bad", "B. iframe never loaded (likely CSP frame-src). Check the console for a CSP violation.");
          }
        }, 6000);

        // C \u2014 proxy the RESOLVED url (Phase 0 only ever proxied the redirecting one).
        say("c", "wait", "C. Trying cors-proxy on the RESOLVED url\u2026");
        var proxied = "https://plugins.amplenote.com/cors-proxy?apiurl=" + encodeURIComponent(url);
        fetch(proxied)
          .then(function (r) {
            return r.arrayBuffer().then(function (b) { return { status: r.status, bytes: b.byteLength }; });
          })
          .then(function (r) {
            if (r.status === 200 && r.bytes > 1000) {
              say("c", "ok", "C. OK \u2014 proxy returned " + r.bytes +
                " bytes. PDF.js is viable, so the Annotator's viewer could be reused.");
            } else {
              say("c", "bad", "C. proxy returned HTTP " + r.status + ", " + r.bytes + " bytes.");
            }
          })
          .catch(function (e) { say("c", "bad", "C. proxy fetch threw: " + e.message); });
      })
      .catch(function (e) { say("a", "bad", "A. fetch threw: " + e.message); });
  }

  window.callAmplenotePlugin(JSON.stringify({ action: "config" }))
    .then(function (raw) {
      var cfg = JSON.parse(raw);
      if (cfg.error) { say("a", "bad", "config failed: " + cfg.error); return; }
      probe(cfg);
    })
    .catch(function (e) { say("a", "bad", "bridge failed: " + e.message); });
})();
<\/script>`}var ne={name:"Zotero Integration",appOption:{"Zotero: Test connection":yt,"Zotero: Search citation":wt,"Zotero: Sync now":Ot,"Zotero: Configure sync":At,"Zotero: PDF viewer spike":Zt},insertText:{"Zotero: Insert citation":pt},renderEmbed:Rt,onEmbedCall:Pt},re=ne;return Ut(oe);})();

  var plugin = __pluginModule.default;
})();
