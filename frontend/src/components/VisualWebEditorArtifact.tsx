import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import {
  ChevronDown, ChevronUp, ChevronRight, Copy, Trash2,
  Undo2, Redo2, AlignLeft, AlignCenter, AlignRight,
  Layers, Package, ZoomIn, ZoomOut, MousePointer2,
  ArrowUp, ArrowDown, ClipboardCopy, ClipboardPaste,
} from 'lucide-react'

export interface VisualEditorSourcePayload { html: string; css: string }

interface Props {
  html?: string
  onSourceChange?: (payload: VisualEditorSourcePayload) => void
}

type TextAlign = 'left' | 'center' | 'right'
type FlexDir = 'row' | 'column'

interface ElInfo {
  id: string | null
  path: string
  tag: string
  text: string | null
  styles: Record<string, string>
}

interface DomNode {
  id: string | null
  tag: string
  label: string
  children: DomNode[]
}

interface SiteTheme {
  bg: string; text: string; font: string
  btnBg: string; btnColor: string; btnRadius: string
  linkColor: string; headColor: string
}

/* ── Harness (injected into iframe) ─────────────────────────────── */
// Pre-load approach: parent sends 'drag-start' postMessage before drag,
// so iframe's own drop handler uses it — no dataTransfer cross-doc issues.
const HARNESS = `<script id="__veh">(function(){
if(window.__veh_loaded)return;
window.__veh_loaded=true;
var sel=null,ov=null,clipboard=null,pendingDrop=null,suppressClick=false;
var hist=[],histIdx=-1;

/* overlay */
function mkOv(){if(ov)return;ov=document.createElement('div');ov.id='__veo';
ov.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #6c63ff;outline-offset:2px;box-shadow:0 0 0 5px rgba(108,99,255,0.13);border-radius:2px;display:none;transition:all 80ms;';
document.body.appendChild(ov);}
function updOv(el){mkOv();var r=el.getBoundingClientRect();
ov.style.top=r.top+'px';ov.style.left=r.left+'px';
ov.style.width=r.width+'px';ov.style.height=r.height+'px';
ov.style.display='block';}
function hideOv(){if(ov)ov.style.display='none';}

/* element IDs for layer tracking */
var idCtr=0;
function assignIds(el){
if(!el||!el.tagName)return;
if(el.id!=='__veo'&&el.id!=='__veh'&&!el.dataset.veId)el.dataset.veId='ve-'+(++idCtr);
for(var i=0;i<el.children.length;i++)assignIds(el.children[i]);}

/* DOM tree for layers panel */
function buildTree(el){
if(!el||!el.tagName)return null;
var t=el.tagName.toLowerCase();
if(['script','style','meta','link','noscript','head'].indexOf(t)>=0)return null;
if(el.id==='__veo'||el.id==='__veh')return null;
var label=t;
if(el.id&&el.id!=='__veo')label+='#'+el.id;
else if(el.className&&typeof el.className==='string'&&el.className.trim()){
var cls=el.className.trim().split(/\\s+/).slice(0,2).join('.');if(cls)label+='.'+cls;}
var ch=[];for(var i=0;i<el.children.length;i++){var c=buildTree(el.children[i]);if(c)ch.push(c);}
return{id:el.dataset&&el.dataset.veId||null,tag:t,label:label,children:ch};}
function reportTree(){
assignIds(document.body);
window.parent.postMessage({type:'dom-tree',tree:buildTree(document.body)},'*');}

/* clean html (strips harness from clone) */
function getCleanHtml(){
var clone=document.documentElement.cloneNode(true);
['#__veh','#__veo'].forEach(function(sel2){var el=clone.querySelector(sel2);if(el&&el.parentNode)el.parentNode.removeChild(el);});
return clone.outerHTML;}
function sync(){
assignIds(document.body);
window.parent.postMessage({type:'html-sync',html:getCleanHtml()},'*');
reportTree();}

/* history */
function saveHist(){
var h=getCleanHtml();
hist=hist.slice(0,histIdx+1);hist.push(h);
if(hist.length>50)hist.shift();
histIdx=hist.length-1;
window.parent.postMessage({type:'history-state',canUndo:histIdx>0,canRedo:histIdx<hist.length-1},'*');}
function restoreHist(h){
var parser=new DOMParser();var doc=parser.parseFromString(h,'text/html');
document.body.innerHTML=doc.body.innerHTML;
if(document.head&&doc.head){
var styles=doc.head.querySelectorAll('style');var existing=document.head.querySelectorAll('style:not(#__ve_base)');
existing.forEach(function(s){s.parentNode&&s.parentNode.removeChild(s);});
styles.forEach(function(s){document.head.appendChild(s.cloneNode(true));});}
sel=null;hideOv();mkOv();document.body.appendChild(ov);assignIds(document.body);}
function undo(){if(histIdx<=0)return;histIdx--;restoreHist(hist[histIdx]);
sync();window.parent.postMessage({type:'history-state',canUndo:histIdx>0,canRedo:true},'*');}
function redo(){if(histIdx>=hist.length-1)return;histIdx++;restoreHist(hist[histIdx]);
sync();window.parent.postMessage({type:'history-state',canUndo:histIdx>0,canRedo:histIdx<hist.length-1},'*');}

/* path & computed styles */
function getPath(el){var p=[];
while(el&&el!==document.body&&el!==document.documentElement){
var s=el.tagName.toLowerCase();
if(el.id&&el.id!=='__veo')s+='#'+el.id;
else{var par=el.parentElement;if(par){var sib=Array.from(par.children).filter(function(c){return c.tagName===el.tagName;});if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(el)+1)+')';}}
p.unshift(s);el=el.parentElement;}return p.join(' > ');}
function getStyles(el){var c=window.getComputedStyle(el);
return{color:c.color,backgroundColor:c.backgroundColor,fontSize:c.fontSize,fontWeight:c.fontWeight,fontFamily:c.fontFamily,textAlign:c.textAlign,borderColor:c.borderColor,borderWidth:c.borderWidth,borderRadius:c.borderRadius,borderStyle:c.borderStyle,paddingTop:c.paddingTop,paddingRight:c.paddingRight,paddingBottom:c.paddingBottom,paddingLeft:c.paddingLeft,marginTop:c.marginTop,marginRight:c.marginRight,marginBottom:c.marginBottom,marginLeft:c.marginLeft,width:c.width,height:c.height,opacity:c.opacity,boxShadow:c.boxShadow,display:c.display,flexDirection:c.flexDirection,gap:c.gap,alignItems:c.alignItems,justifyContent:c.justifyContent,position:c.position,top:c.top,left:c.left,right:c.right,bottom:c.bottom,letterSpacing:c.letterSpacing,lineHeight:c.lineHeight,textDecoration:c.textDecoration};}
function pickEl(el){
if(!el||el===document.body||el===document.documentElement||el.id==='__veo'||el.id==='__veh'||!el.tagName||el.tagName==='SCRIPT'||el.tagName==='STYLE')return;
sel=el;updOv(el);
var txt=null;
if(el.childNodes.length===1&&el.childNodes[0].nodeType===3)txt=el.textContent;
var r=el.getBoundingClientRect();
window.parent.postMessage({type:'element-selected',id:el.dataset&&el.dataset.veId||null,path:getPath(el),styles:getStyles(el),tag:el.tagName.toLowerCase(),text:txt,rect:{top:r.top,left:r.left,width:r.width,height:r.height}},'*');}

/* theme extraction */
function extractTheme(){
var h_el=document.documentElement;
var b=window.getComputedStyle(document.body);var h=window.getComputedStyle(h_el);
var bg=b.backgroundColor;
if(!bg||bg==='rgba(0, 0, 0, 0)'||bg==='transparent')bg=h.backgroundColor;
if(!bg||bg==='rgba(0, 0, 0, 0)'||bg==='transparent')bg='#ffffff';
var textCol=b.color||h.color;
var font=b.fontFamily||h.fontFamily||'system-ui,sans-serif';
var btns=Array.from(document.querySelectorAll('button,[role=button],[type=submit],.btn,.button')).filter(function(el){var c=window.getComputedStyle(el).backgroundColor;return c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent';});
var links=document.querySelectorAll('a');var heads=document.querySelectorAll('h1,h2,h3');
var btnEl=btns.length?window.getComputedStyle(btns[0]):null;
return{bg:bg,text:textCol,font:font,
btnBg:btnEl?btnEl.backgroundColor:'',
btnColor:btnEl?btnEl.color:'',
btnRadius:btnEl?btnEl.borderRadius:'6px',
linkColor:links.length?window.getComputedStyle(links[0]).color:'',
headColor:heads.length?window.getComputedStyle(heads[0]).color:''};}

/* insert at position (elementFromPoint) */
function insertHtml(html,x,y){
var tmp=document.createElement('div');tmp.innerHTML=html;
var n=tmp.firstElementChild||tmp.firstChild;
if(!n)return;
if(typeof x==='number'&&typeof y==='number'){
var cands=document.elementsFromPoint(x,y)||[];
var target=null;
for(var i=0;i<cands.length;i++){
var c2=cands[i];
if(c2!==document.body&&c2!==document.documentElement&&c2.id!=='__veo'&&c2.id!=='__veh'&&c2.tagName!=='SCRIPT'&&c2.tagName!=='HTML'){target=c2;break;}}
if(target&&target.parentNode){
var r2=target.getBoundingClientRect();
if(y>r2.top+r2.height/2){if(target.after)target.after(n);else target.parentNode.insertBefore(n,target.nextSibling);}
else{if(target.before)target.before(n);else target.parentNode.insertBefore(n,target);}
}else{document.body.appendChild(n);}
}else{document.body.appendChild(n);}
assignIds(n);saveHist();sync();pickEl(n);}

/* events */
document.addEventListener('click',function(e){if(suppressClick){e.stopPropagation();return;}e.preventDefault();e.stopPropagation();pickEl(e.target);},true);
document.addEventListener('dblclick',function(e){
if(!sel||sel.id==='__veo')return;
e.preventDefault();e.stopPropagation();
sel.contentEditable='true';sel.focus();
var r=document.createRange();r.selectNodeContents(sel);var s=window.getSelection();s.removeAllRanges();s.addRange(r);
window.parent.postMessage({type:'editing-text'},'*');},true);
document.addEventListener('focusout',function(e){
if(e.target===sel&&sel&&sel.contentEditable==='true'){
sel.contentEditable='false';
window.parent.postMessage({type:'text-edit-done',text:sel.textContent||''},'*');
saveHist();sync();}},true);
document.addEventListener('scroll',function(){if(sel)updOv(sel);},true);
window.addEventListener('resize',function(){if(sel)updOv(sel);});

/* keyboard shortcuts */
document.addEventListener('keydown',function(e){
if(sel&&sel.contentEditable==='true')return;
var ctrl=e.ctrlKey||e.metaKey;
if((e.key==='Delete'||e.key==='Backspace')&&sel&&!ctrl){
e.preventDefault();if(sel.parentNode)sel.parentNode.removeChild(sel);
sel=null;hideOv();saveHist();sync();window.parent.postMessage({type:'element-deselected'},'*');return;}
if(ctrl&&e.key==='z'){e.preventDefault();undo();return;}
if(ctrl&&(e.key==='y'||e.key==='Y')){e.preventDefault();redo();return;}
if(ctrl&&e.key==='d'&&sel){e.preventDefault();
var cl=sel.cloneNode(true);delete cl.dataset.veId;
if(sel.after)sel.after(cl);else sel.parentNode.insertBefore(cl,sel.nextSibling);
assignIds(cl);saveHist();sync();pickEl(cl);return;}
if(ctrl&&e.key==='c'&&sel){e.preventDefault();clipboard=sel.outerHTML;
window.parent.postMessage({type:'clipboard-set'},'*');return;}
if(ctrl&&e.key==='v'){e.preventDefault();
if(clipboard){var tmp2=document.createElement('div');tmp2.innerHTML=clipboard;var n2=tmp2.firstElementChild;
if(n2){delete n2.dataset.veId;if(sel&&sel.after)sel.after(n2);else document.body.appendChild(n2);
assignIds(n2);saveHist();sync();pickEl(n2);}}return;}
if(ctrl&&e.key==='ArrowUp'&&sel&&sel.previousElementSibling){
e.preventDefault();var prev=sel.previousElementSibling;
if(prev.id==='__veo')return;
if(prev.before)prev.before(sel);else prev.parentNode.insertBefore(sel,prev);
updOv(sel);saveHist();sync();reportTree();return;}
if(ctrl&&e.key==='ArrowDown'&&sel&&sel.nextElementSibling){
e.preventDefault();var nxt2=sel.nextElementSibling;
if(nxt2.id==='__veo')return;
if(nxt2.after)nxt2.after(sel);else nxt2.parentNode.insertBefore(sel,nxt2.nextSibling);
updOv(sel);saveHist();sync();reportTree();return;}
if(sel&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)>=0&&!ctrl){
var pos=window.getComputedStyle(sel).position;
if(pos==='absolute'||pos==='fixed'||pos==='relative'){
e.preventDefault();var step=e.shiftKey?10:1;
var t2=parseFloat(sel.style.top)||0,l2=parseFloat(sel.style.left)||0;
if(e.key==='ArrowUp')sel.style.top=(t2-step)+'px';
if(e.key==='ArrowDown')sel.style.top=(t2+step)+'px';
if(e.key==='ArrowLeft')sel.style.left=(l2-step)+'px';
if(e.key==='ArrowRight')sel.style.left=(l2+step)+'px';
updOv(sel);saveHist();sync();}}},false);

/* drop indicator */
var dropInd=null;
function mkDropInd(){if(dropInd)return;dropInd=document.createElement('div');dropInd.id='__ve_di';
dropInd.style.cssText='position:fixed;height:3px;background:linear-gradient(90deg,#6c63ff,#a78bfa);border-radius:2px;pointer-events:none;z-index:2147483646;display:none;box-shadow:0 0 8px rgba(108,99,255,0.45);transition:top 60ms,left 60ms,width 60ms;';
document.body.appendChild(dropInd);}
function showDropInd(el,before){mkDropInd();var r=el.getBoundingClientRect();
dropInd.style.top=(before?r.top:r.bottom)-1.5+'px';
dropInd.style.left=r.left+'px';dropInd.style.width=r.width+'px';dropInd.style.display='block';}
function hideDropInd(){if(dropInd)dropInd.style.display='none';}

/* internal element drag-to-reorder */
var intDragSrc=null,intGhost=null,intDragActive=false;
document.addEventListener('mousedown',function(e){
if(e.button!==0||!sel||sel.contentEditable==='true')return;
if(e.target!==sel&&!sel.contains(e.target))return;
var sx=e.clientX,sy=e.clientY,moved=false;
function onMove(ev){
var dx=ev.clientX-sx,dy=ev.clientY-sy;
if(!moved&&(Math.abs(dx)>6||Math.abs(dy)>6)){
moved=true;intDragActive=true;intDragSrc=sel;
var r=intDragSrc.getBoundingClientRect();
intGhost=document.createElement('div');
intGhost.style.cssText='position:fixed;pointer-events:none;z-index:2147483645;opacity:0.52;border:2px dashed #6c63ff;border-radius:6px;background:rgba(108,99,255,0.06);box-shadow:0 4px 20px rgba(0,0,0,0.14);transition:none;';
intGhost.style.width=r.width+'px';intGhost.style.height=r.height+'px';
intGhost.style.left=r.left+'px';intGhost.style.top=r.top+'px';
document.body.appendChild(intGhost);}
if(moved&&intGhost){
intGhost.style.left=(ev.clientX-parseFloat(intGhost.style.width)/2)+'px';
intGhost.style.top=(ev.clientY-20)+'px';
hideOv();
var cands=document.elementsFromPoint(ev.clientX,ev.clientY)||[];
for(var i=0;i<cands.length;i++){var c=cands[i];
if(c===intDragSrc||intDragSrc.contains(c)||c===intGhost||c===ov||c===dropInd||c.id==='__ve_di'||c.id==='__veo'||c===document.body||c===document.documentElement||c.tagName==='HTML'||c.tagName==='SCRIPT'||c.tagName==='STYLE')continue;
var r3=c.getBoundingClientRect();showDropInd(c,ev.clientY<r3.top+r3.height/2);break;}}}
function onUp(ev){
document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);
if(intGhost&&intGhost.parentNode)intGhost.parentNode.removeChild(intGhost);intGhost=null;
hideDropInd();
if(!moved||!intDragSrc){intDragActive=false;intDragSrc=null;return;}
suppressClick=true;setTimeout(function(){suppressClick=false;},120);
var cands2=document.elementsFromPoint(ev.clientX,ev.clientY)||[];
var target=null,insertBef=false;
for(var j=0;j<cands2.length;j++){var c2=cands2[j];
if(c2===intDragSrc||intDragSrc.contains(c2)||c2===intGhost||c2===ov||c2===dropInd||c2.id==='__ve_di'||c2.id==='__veo'||c2===document.body||c2===document.documentElement||c2.tagName==='HTML'||c2.tagName==='SCRIPT'||c2.tagName==='STYLE')continue;
target=c2;var r4=c2.getBoundingClientRect();insertBef=ev.clientY<r4.top+r4.height/2;break;}
if(target&&target.parentNode){
if(insertBef){if(target.before)target.before(intDragSrc);else target.parentNode.insertBefore(intDragSrc,target);}
else{if(target.after)target.after(intDragSrc);else target.parentNode.insertBefore(intDragSrc,target.nextSibling);}}
intDragActive=false;intDragSrc=null;
if(sel){updOv(sel);saveHist();sync();reportTree();}}
document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);},true);

/* drop: pre-load via 'drag-start' postMessage; no dataTransfer cross-doc needed */
document.addEventListener('dragover',function(e){if(pendingDrop){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';
var cands=document.elementsFromPoint(e.clientX,e.clientY)||[];
for(var i=0;i<cands.length;i++){var c=cands[i];
if(c===document.body||c===document.documentElement||c.id==='__veo'||c.id==='__veh'||c.id==='__ve_di'||c.tagName==='SCRIPT'||c.tagName==='HTML'||c.tagName==='STYLE')continue;
var r=c.getBoundingClientRect();showDropInd(c,e.clientY<r.top+r.height/2);break;}}});
document.addEventListener('drop',function(e){
e.preventDefault();hideDropInd();
var h=pendingDrop;pendingDrop=null;
if(!h)return;
insertHtml(h,e.clientX,e.clientY);});
document.addEventListener('dragleave',function(e){if(!e.relatedTarget)hideDropInd();});

/* message handler */
window.addEventListener('message',function(e){
var m=e.data;if(!m||!m.type)return;
switch(m.type){
case 'drag-start':pendingDrop=m.html;break;
case 'drag-cancel':pendingDrop=null;break;
case 'get-html':sync();break;
case 'deselect':sel=null;hideOv();break;
case 'delete-selected':
if(sel&&sel.parentNode){sel.parentNode.removeChild(sel);sel=null;hideOv();saveHist();sync();
window.parent.postMessage({type:'element-deselected'},'*');}break;
case 'update-style':
if(sel){Object.assign(sel.style,m.styles);updOv(sel);saveHist();sync();}break;
case 'update-text':
if(sel){sel.textContent=m.text;saveHist();sync();}break;
case 'insert-html':insertHtml(m.html,m.x,m.y);break;
case 'undo':undo();break;
case 'redo':redo();break;
case 'duplicate':
if(sel){var cl2=sel.cloneNode(true);delete cl2.dataset.veId;
if(sel.after)sel.after(cl2);else sel.parentNode.insertBefore(cl2,sel.nextSibling);
assignIds(cl2);saveHist();sync();pickEl(cl2);}break;
case 'copy':if(sel)clipboard=sel.outerHTML;break;
case 'paste':
if(clipboard){var tmp3=document.createElement('div');tmp3.innerHTML=clipboard;var n3=tmp3.firstElementChild;
if(n3){delete n3.dataset.veId;if(sel&&sel.after)sel.after(n3);else document.body.appendChild(n3);
assignIds(n3);saveHist();sync();pickEl(n3);}}break;
case 'move-up':
if(sel&&sel.previousElementSibling&&sel.previousElementSibling.id!=='__veo'){
var p2=sel.previousElementSibling;if(p2.before)p2.before(sel);else p2.parentNode.insertBefore(sel,p2);
updOv(sel);saveHist();sync();reportTree();}break;
case 'move-down':
if(sel&&sel.nextElementSibling&&sel.nextElementSibling.id!=='__veo'){
var nx=sel.nextElementSibling;if(nx.after)nx.after(sel);else nx.parentNode.insertBefore(sel,nx.nextSibling);
updOv(sel);saveHist();sync();reportTree();}break;
case 'align':
if(sel){
if(m.dir==='left'){sel.style.marginLeft='0';sel.style.marginRight='auto';}
else if(m.dir==='center'){sel.style.display='block';sel.style.marginLeft='auto';sel.style.marginRight='auto';}
else if(m.dir==='right'){sel.style.marginLeft='auto';sel.style.marginRight='0';}
else if(m.dir==='full-w'){sel.style.width='100%';}
saveHist();sync();updOv(sel);}break;
case 'select-by-id':
var tgt=document.querySelector('[data-ve-id="'+m.id+'"]');if(tgt)pickEl(tgt);break;
case 'wrap-flex':
if(sel){var wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
assignIds(wrap);saveHist();sync();pickEl(sel);}break;
case 'unwrap':
if(sel&&sel.parentNode&&sel.parentNode!==document.body){
var pp=sel.parentNode;var gp=pp.parentNode;if(gp){
while(pp.firstChild)gp.insertBefore(pp.firstChild,pp);
gp.removeChild(pp);assignIds(document.body);saveHist();sync();pickEl(sel);}}break;
}});

/* init */
assignIds(document.body);saveHist();
window.parent.postMessage({type:'harness-ready',theme:extractTheme()},'*');
})()</script>`

/* ── Adaptive palette factory ─────────────────────────────────────── */
interface PaletteItem { label: string; html: string }
interface PaletteGroup { group: string; items: PaletteItem[] }

function toHex(color: string): string {
  if (!color || color === 'transparent' || color.startsWith('rgba(0, 0, 0, 0)')) return ''
  if (color.startsWith('#')) {
    if (color.length === 4) return '#' + color[1]+color[1]+color[2]+color[2]+color[3]+color[3]
    return color.substring(0, 7)
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
  return ''
}

function parsePx(v: string) { return parseFloat(v) || 0 }

function makePalette(theme: SiteTheme | null): PaletteGroup[] {
  const btnBg = (theme?.btnBg && toHex(theme.btnBg)) || '#6c63ff'
  const btnColor = (theme?.btnColor && toHex(theme.btnColor)) || '#fff'
  const btnR = theme?.btnRadius || '6px'
  const textC = (theme?.text && toHex(theme.text)) || '#111111'
  const headC = (theme?.headColor && toHex(theme.headColor)) || textC
  const linkC = (theme?.linkColor && toHex(theme.linkColor)) || btnBg
  const rawFont = theme?.font || 'system-ui, sans-serif'
  const font = rawFont || 'system-ui, sans-serif'

  return [
    {
      group: 'Basic',
      items: [
        { label: 'Button', html: `<button style="padding:8px 18px;background:${btnBg};color:${btnColor};border:none;border-radius:${btnR};font-size:14px;cursor:pointer;font-weight:600;font-family:${font}">Button</button>` },
        { label: 'Outline Btn', html: `<button style="padding:8px 18px;background:transparent;color:${btnBg};border:2px solid ${btnBg};border-radius:${btnR};font-size:14px;cursor:pointer;font-weight:600;font-family:${font}">Button</button>` },
        { label: 'Heading 1', html: `<h1 style="font-size:32px;font-weight:800;color:${headC};margin:8px 0;line-height:1.2;font-family:${font}">Main Heading</h1>` },
        { label: 'Heading 2', html: `<h2 style="font-size:24px;font-weight:700;color:${headC};margin:8px 0;line-height:1.3;font-family:${font}">Sub Heading</h2>` },
        { label: 'Paragraph', html: `<p style="font-size:15px;color:${textC};margin:8px 0;line-height:1.7;font-family:${font}">Paragraph text goes here. Click to edit this text inline.</p>` },
        { label: 'Link', html: `<a href="#" style="color:${linkC};font-size:14px;text-decoration:underline;font-family:${font}">Link text →</a>` },
        { label: 'Input', html: `<input type="text" placeholder="Type here…" style="padding:10px 14px;border:1px solid #d1d5db;border-radius:${btnR};font-size:14px;width:220px;outline:none;font-family:${font};display:block;color:${textC}">` },
        { label: 'Textarea', html: `<textarea placeholder="Write something…" rows="4" style="padding:10px 14px;border:1px solid #d1d5db;border-radius:${btnR};font-size:14px;width:220px;resize:vertical;outline:none;font-family:${font};display:block;color:${textC}"></textarea>` },
        { label: 'Select', html: `<select style="padding:10px 14px;border:1px solid #d1d5db;border-radius:${btnR};font-size:14px;background:#fff;outline:none;font-family:${font};color:${textC};display:block"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select>` },
        { label: 'Checkbox', html: `<label style="display:inline-flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;font-family:${font};color:${textC}"><input type="checkbox"><span>Option label</span></label>` },
        { label: 'Radio', html: `<label style="display:inline-flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;font-family:${font};color:${textC}"><input type="radio" name="r"><span>Radio option</span></label>` },
        { label: 'Image', html: `<img src="https://placehold.co/320x200/e5e7eb/9ca3af?text=Image" alt="placeholder" style="border-radius:${btnR};display:block;max-width:100%;height:auto">` },
      ],
    },
    {
      group: 'UI',
      items: [
        { label: 'Card', html: `<div style="padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);max-width:300px;font-family:${font}"><h3 style="margin:0 0 10px;font-size:16px;font-weight:700;color:${headC}">Card Title</h3><p style="margin:0;color:${textC};font-size:14px;line-height:1.6;opacity:.8">Card description goes here. Explain what this card is about.</p><button style="margin-top:16px;padding:8px 18px;background:${btnBg};color:${btnColor};border:none;border-radius:${btnR};font-size:13px;cursor:pointer;font-weight:600">Learn more</button></div>` },
        { label: 'Badge', html: `<span style="display:inline-block;padding:3px 10px;background:${btnBg}22;color:${btnBg};border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.3px;font-family:${font}">Badge</span>` },
        { label: 'Avatar', html: `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${btnBg},${linkC});display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;font-family:${font};flex-shrink:0">A</div>` },
        { label: 'Alert info', html: `<div style="padding:14px 16px;background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;color:#1e40af;font-size:14px;display:flex;align-items:flex-start;gap:10px;font-family:${font}"><span style="font-size:16px;flex-shrink:0">ℹ️</span><span>This is an informational alert message. Click to edit.</span></div>` },
        { label: 'Alert warn', html: `<div style="padding:14px 16px;background:#fffbeb;border:1px solid #fbbf24;border-radius:10px;color:#92400e;font-size:14px;display:flex;align-items:flex-start;gap:10px;font-family:${font}"><span style="font-size:16px;flex-shrink:0">⚠️</span><span>Warning: please review this before continuing.</span></div>` },
        { label: 'Progress', html: `<div style="width:240px;font-family:${font}"><div style="display:flex;justify-content:space-between;font-size:12px;color:${textC};opacity:.7;margin-bottom:6px"><span>Progress</span><span>65%</span></div><div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden"><div style="background:${btnBg};height:100%;width:65%;border-radius:999px;transition:width .3s"></div></div></div>` },
        { label: 'Divider', html: `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;font-family:${font}"><div style="flex:1;height:1px;background:#e5e7eb"></div><span style="font-size:12px;color:${textC};opacity:.5">or</span><div style="flex:1;height:1px;background:#e5e7eb"></div></div>` },
        { label: 'Spinner', html: `<div style="display:inline-flex;align-items:center;gap:10px;font-family:${font}"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:${btnBg};border-radius:50%;animation:ve-spin .8s linear infinite"></div><span style="font-size:14px;color:${textC};opacity:.7">Loading…</span></div><style>@keyframes ve-spin{to{transform:rotate(360deg)}}</style>` },
        { label: 'Tag group', html: `<div style="display:flex;gap:8px;flex-wrap:wrap;font-family:${font}"><span style="padding:4px 12px;background:${btnBg}22;color:${btnBg};border-radius:999px;font-size:12px;font-weight:600">Design</span><span style="padding:4px 12px;background:${btnBg}22;color:${btnBg};border-radius:999px;font-size:12px;font-weight:600">Frontend</span><span style="padding:4px 12px;background:${btnBg}22;color:${btnBg};border-radius:999px;font-size:12px;font-weight:600">React</span></div>` },
      ],
    },
    {
      group: 'Layout',
      items: [
        { label: 'Navbar', html: `<nav style="display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:60px;background:#fff;border-bottom:1px solid #e5e7eb;width:100%;font-family:${font}"><span style="font-size:17px;font-weight:800;color:${headC}">Brand</span><div style="display:flex;gap:24px;font-size:14px"><a href="#" style="text-decoration:none;color:${textC};opacity:.7">Home</a><a href="#" style="text-decoration:none;color:${textC};opacity:.7">About</a><a href="#" style="text-decoration:none;color:${textC};opacity:.7">Work</a><a href="#" style="text-decoration:none;color:${textC};opacity:.7">Contact</a></div><button style="padding:8px 18px;background:${btnBg};color:${btnColor};border:none;border-radius:${btnR};font-size:13px;cursor:pointer;font-weight:600">Sign in</button></nav>` },
        { label: 'Hero section', html: `<section style="padding:80px 32px;text-align:center;background:linear-gradient(135deg,${btnBg}15 0%,${linkC}10 100%);font-family:${font}"><div style="display:inline-block;padding:4px 14px;background:${btnBg}20;color:${btnBg};border-radius:999px;font-size:12px;font-weight:600;margin-bottom:20px">✨ Now in beta</div><h1 style="margin:0 0 20px;font-size:42px;font-weight:900;color:${headC};line-height:1.15;max-width:600px;margin-left:auto;margin-right:auto">Build something amazing with AI</h1><p style="margin:0 0 36px;font-size:18px;color:${textC};opacity:.7;max-width:500px;margin-left:auto;margin-right:auto;line-height:1.7">Describe your vision and watch it come to life instantly.</p><div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap"><button style="padding:14px 32px;background:${btnBg};color:${btnColor};border:none;border-radius:${btnR};font-size:16px;cursor:pointer;font-weight:700">Get started free</button><button style="padding:14px 32px;background:transparent;color:${textC};border:1px solid #d1d5db;border-radius:${btnR};font-size:16px;cursor:pointer">See demo →</button></div></section>` },
        { label: 'Footer', html: `<footer style="padding:40px 28px;background:#111;color:#9ca3af;font-family:${font}"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px"><span style="font-size:16px;font-weight:700;color:#fff">Brand</span><div style="display:flex;gap:20px;font-size:13px"><a href="#" style="color:#9ca3af;text-decoration:none">Privacy</a><a href="#" style="color:#9ca3af;text-decoration:none">Terms</a><a href="#" style="color:#9ca3af;text-decoration:none">Contact</a></div><p style="font-size:12px;color:#6b7280;margin:0">© 2024 Your Company</p></div></footer>` },
        { label: '2-col grid', html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px;font-family:${font}"><div style="padding:28px;background:#f9fafb;border-radius:12px;border:1px dashed #d1d5db;text-align:center;color:${textC};opacity:.6;font-size:14px">Column 1</div><div style="padding:28px;background:#f9fafb;border-radius:12px;border:1px dashed #d1d5db;text-align:center;color:${textC};opacity:.6;font-size:14px">Column 2</div></div>` },
        { label: '3-col grid', html: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:16px;font-family:${font}"><div style="padding:20px;background:#f9fafb;border-radius:10px;border:1px dashed #d1d5db;text-align:center;color:${textC};opacity:.6;font-size:13px">Col 1</div><div style="padding:20px;background:#f9fafb;border-radius:10px;border:1px dashed #d1d5db;text-align:center;color:${textC};opacity:.6;font-size:13px">Col 2</div><div style="padding:20px;background:#f9fafb;border-radius:10px;border:1px dashed #d1d5db;text-align:center;color:${textC};opacity:.6;font-size:13px">Col 3</div></div>` },
        { label: 'Feature row', html: `<div style="display:flex;gap:24px;padding:24px;flex-wrap:wrap;font-family:${font}"><div style="flex:1;min-width:180px;text-align:center"><div style="width:48px;height:48px;background:${btnBg}20;border-radius:12px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:24px">⚡</div><h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:${headC}">Fast</h3><p style="margin:0;font-size:13px;color:${textC};opacity:.7;line-height:1.6">Lightning fast performance</p></div><div style="flex:1;min-width:180px;text-align:center"><div style="width:48px;height:48px;background:${btnBg}20;border-radius:12px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:24px">🔒</div><h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:${headC}">Secure</h3><p style="margin:0;font-size:13px;color:${textC};opacity:.7;line-height:1.6">Enterprise-grade security</p></div><div style="flex:1;min-width:180px;text-align:center"><div style="width:48px;height:48px;background:${btnBg}20;border-radius:12px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:24px">🎨</div><h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:${headC}">Beautiful</h3><p style="margin:0;font-size:13px;color:${textC};opacity:.7;line-height:1.6">Stunning design out of the box</p></div></div>` },
      ],
    },
  ]
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function injectHarness(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style id="__ve_base">*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:24px;min-height:100vh;background:#fff}</style></head><body><p style="color:#9ca3af;font-size:14px;text-align:center;margin-top:80px;opacity:.7">Canvas is empty — drag components from the left panel</p>${HARNESS}</body></html>`
  }
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
    const idx = trimmed.lastIndexOf('</body>')
    if (idx !== -1) return trimmed.slice(0, idx) + HARNESS + trimmed.slice(idx)
    return trimmed + HARNESS
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style id="__ve_base">*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#fff}</style></head><body>${trimmed}${HARNESS}</body></html>`
}

/* ── Shared style constants ──────────────────────────────────────── */
const IN: React.CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '2px 6px', fontSize: 11,
  color: 'var(--text-0)', fontFamily: 'inherit', minWidth: 0, width: '100%',
}

function pBtn(active: boolean): React.CSSProperties {
  return { flex: 1, padding: '2px 0', background: active ? 'var(--accent)' : 'var(--bg-2)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 3, fontSize: 10, color: active ? '#fff' : 'var(--text-1)', cursor: 'pointer' }
}

/* ── TreeNode for layers panel ───────────────────────────────────── */
function TreeNode({ node, depth, selectedId, onSelect }: {
  node: DomNode; depth: number; selectedId: string | null; onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const isSelected = node.id && node.id === selectedId
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        onClick={() => { if (node.id) onSelect(node.id) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: `3px 6px 3px ${8 + depth * 12}px`,
          cursor: 'pointer',
          background: isSelected ? 'var(--accent)20' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          borderRadius: 3,
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {hasChildren ? (
          <span onClick={e => { e.stopPropagation(); setOpen(o => !o) }} style={{ color: 'var(--text-2)', flexShrink: 0, display: 'flex' }}>
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <code style={{ fontSize: 11, color: isSelected ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.label}
        </code>
      </div>
      {open && hasChildren && node.children.map((child, i) => (
        <TreeNode key={`${child.id ?? child.tag}-${i}`} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}

/* ── PropSection / PropRow ───────────────────────────────────────── */
function PropSection({ label }: { label: string }) {
  return <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginTop: 4 }}>{label}</div>
}
function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: 'var(--text-2)', fontSize: 11, minWidth: 54, flexShrink: 0 }}>{label}</span>{children}</div>
}

/* ── Main component ──────────────────────────────────────────────── */
export default function VisualWebEditorArtifact({ html: initialHtml = '', onSourceChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastSentRef = useRef<string>('')
  const dragDropSentRef = useRef(false)

  const [srcdoc, setSrcdoc] = useState(() => injectHarness(initialHtml))
  const [harnessReady, setHarnessReady] = useState(false)
  const [selected, setSelected] = useState<ElInfo | null>(null)
  const [liveHtml, setLiveHtml] = useState(initialHtml)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [leftTab, setLeftTab] = useState<'components' | 'layers'>('components')
  const [domTree, setDomTree] = useState<DomNode | null>(null)
  const [siteTheme, setSiteTheme] = useState<SiteTheme | null>(null)
  const [zoom, setZoom] = useState(100)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [isEditingText, setIsEditingText] = useState(false)

  // Pending style changes (explicit Apply required)
  const [pendingStyles, setPendingStyles] = useState<Record<string, string>>({})
  const [pendingText, setPendingText] = useState<string | null>(null)
  const hasPending = Object.keys(pendingStyles).length > 0 || pendingText !== null

  // Property panel state
  const [propColor, setPropColor] = useState('#111111')
  const [propBg, setPropBg] = useState('#ffffff')
  const [propBorderColor, setPropBorderColor] = useState('#d1d5db')
  const [propBorderWidth, setPropBorderWidth] = useState(0)
  const [propBorderRadius, setPropBorderRadius] = useState(0)
  const [propBorderStyle, setPropBorderStyle] = useState('none')
  const [propFontSize, setPropFontSize] = useState(14)
  const [propFontWeight, setPropFontWeight] = useState(400)
  const [propTextAlign, setPropTextAlign] = useState<TextAlign>('left')
  const [propOpacity, setPropOpacity] = useState(1)
  const [propPadT, setPropPadT] = useState(0)
  const [propPadR, setPropPadR] = useState(0)
  const [propPadB, setPropPadB] = useState(0)
  const [propPadL, setPropPadL] = useState(0)
  const [propWidth, setPropWidth] = useState('auto')
  const [propHeight, setPropHeight] = useState('auto')
  const [propDisplay, setPropDisplay] = useState('block')
  const [propFlexDir, setPropFlexDir] = useState<FlexDir>('row')
  const [propGap, setPropGap] = useState(0)
  const [propText, setPropText] = useState('')
  const [propLetterSpacing, setPropLetterSpacing] = useState(0)
  const [propLineHeight, setPropLineHeight] = useState(1.5)
  const [propBoxShadow, setPropBoxShadow] = useState('')

  // Reload only when external HTML changes (not from our own edits)
  useEffect(() => {
    if (initialHtml === lastSentRef.current) return
    lastSentRef.current = ''
    setSrcdoc(injectHarness(initialHtml))
    setHarnessReady(false)
    setSelected(null)
    setPendingStyles({})
    setPendingText(null)
    setLiveHtml(initialHtml)
    setDomTree(null)
    setSiteTheme(null)
  }, [initialHtml])

  const send = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [])

  // postMessage listener
  useEffect(() => {
    const syncPropsFromStyles = (s: Record<string, string>, textVal: string | null) => {
      setPropColor(toHex(s.color ?? '') || '#111111')
      setPropBg(toHex(s.backgroundColor ?? '') || '#ffffff')
      setPropFontSize(parsePx(s.fontSize ?? ''))
      setPropFontWeight(parseInt(s.fontWeight ?? '') || 400)
      setPropTextAlign((s.textAlign as TextAlign) || 'left')
      setPropBorderColor(toHex(s.borderColor ?? '') || '#d1d5db')
      setPropBorderWidth(parsePx(s.borderWidth ?? ''))
      setPropBorderRadius(parsePx(s.borderRadius ?? ''))
      setPropBorderStyle(s.borderStyle || 'none')
      setPropOpacity(parseFloat(s.opacity ?? '') || 1)
      setPropPadT(parsePx(s.paddingTop ?? ''))
      setPropPadR(parsePx(s.paddingRight ?? ''))
      setPropPadB(parsePx(s.paddingBottom ?? ''))
      setPropPadL(parsePx(s.paddingLeft ?? ''))
      setPropWidth(s.width || 'auto')
      setPropHeight(s.height || 'auto')
      setPropDisplay(s.display || 'block')
      setPropFlexDir((s.flexDirection as FlexDir) || 'row')
      setPropGap(parsePx(s.gap ?? ''))
      setPropLetterSpacing(parsePx(s.letterSpacing ?? ''))
      setPropLineHeight(parseFloat(s.lineHeight ?? '') || 1.5)
      setPropBoxShadow(s.boxShadow === 'none' ? '' : (s.boxShadow ?? ''))
      setPropText(textVal || '')
    }

    const handler = (e: MessageEvent) => {
      const m = e.data as Record<string, unknown>
      if (!m?.type) return

      switch (m.type) {
        case 'harness-ready':
          setHarnessReady(true)
          if (m.theme) setSiteTheme(m.theme as SiteTheme)
          break

        case 'element-selected': {
          const s = m.styles as Record<string, string>
          const el: ElInfo = { id: m.id as string | null, path: m.path as string, tag: m.tag as string, text: m.text as string | null, styles: s }
          setSelected(el)
          setPendingStyles({})
          setPendingText(null)
          setIsEditingText(false)
          syncPropsFromStyles(s, m.text as string | null)
          break
        }

        case 'element-deselected':
          setSelected(null)
          setPendingStyles({})
          setPendingText(null)
          setIsEditingText(false)
          break

        case 'editing-text':
          setIsEditingText(true)
          break

        case 'text-edit-done':
          setIsEditingText(false)
          setPropText((m.text as string) || '')
          break

        case 'html-sync': {
          const clean = m.html as string
          lastSentRef.current = clean
          setLiveHtml(clean)
          onSourceChange?.({ html: clean, css: '' })
          break
        }

        case 'dom-tree':
          if (m.tree) setDomTree(m.tree as DomNode)
          break

        case 'history-state':
          setCanUndo(!!m.canUndo)
          setCanRedo(!!m.canRedo)
          break

        case 'clipboard-set':
          // clipboard available
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onSourceChange])

  // Pending change helpers
  const stage = (cssKey: string, value: string) => {
    setPendingStyles(prev => ({ ...prev, [cssKey]: value }))
  }

  const applyPending = useCallback(() => {
    if (Object.keys(pendingStyles).length > 0) send({ type: 'update-style', styles: pendingStyles })
    if (pendingText !== null) send({ type: 'update-text', text: pendingText })
    setPendingStyles({})
    setPendingText(null)
  }, [pendingStyles, pendingText, send])

  const discardPending = useCallback(() => {
    setPendingStyles({})
    setPendingText(null)
    if (selected) {
      const s = selected.styles
      setPropColor(toHex(s.color ?? '') || '#111111')
      setPropBg(toHex(s.backgroundColor ?? '') || '#ffffff')
      setPropFontSize(parsePx(s.fontSize ?? ''))
      setPropFontWeight(parseInt(s.fontWeight ?? '') || 400)
      setPropTextAlign((s.textAlign as TextAlign) || 'left')
      setPropBorderColor(toHex(s.borderColor ?? '') || '#d1d5db')
      setPropBorderWidth(parsePx(s.borderWidth ?? ''))
      setPropBorderRadius(parsePx(s.borderRadius ?? ''))
      setPropBorderStyle(s.borderStyle || 'none')
      setPropOpacity(parseFloat(s.opacity ?? '') || 1)
      setPropPadT(parsePx(s.paddingTop ?? ''))
      setPropPadR(parsePx(s.paddingRight ?? ''))
      setPropPadB(parsePx(s.paddingBottom ?? ''))
      setPropPadL(parsePx(s.paddingLeft ?? ''))
      setPropWidth(s.width || 'auto')
      setPropHeight(s.height || 'auto')
      setPropDisplay(s.display || 'block')
      setPropFlexDir((s.flexDirection as FlexDir) || 'row')
      setPropGap(parsePx(s.gap ?? ''))
      setPropText(selected.text || '')
    }
  }, [selected])

  // Actions
  const deselect = () => { send({ type: 'deselect' }); setSelected(null); setPendingStyles({}); setPendingText(null) }
  const deleteSelected = () => { send({ type: 'delete-selected' }); setSelected(null); setPendingStyles({}); setPendingText(null) }
  const duplicateSelected = () => send({ type: 'duplicate' })
  const copySelected = () => send({ type: 'copy' })
  const pasteClipboard = () => send({ type: 'paste' })
  const moveUp = () => send({ type: 'move-up' })
  const moveDown = () => send({ type: 'move-down' })
  const align = (dir: string) => send({ type: 'align', dir })
  const selectById = (id: string) => send({ type: 'select-by-id', id })
  const wrapFlex = () => send({ type: 'wrap-flex' })
  const unwrap = () => send({ type: 'unwrap' })

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(liveHtml); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /**/ }
  }

  // Palette drag: send postMessage to iframe BEFORE drag so iframe's drop handler has the HTML
  const onPaletteDragStart = (e: ReactDragEvent, html: string, label: string) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', 'component')
    // Skeleton ghost shows component name + approx dimensions
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;padding:8px 18px;background:linear-gradient(135deg,rgba(108,99,255,0.12),rgba(167,139,250,0.1));border:2px dashed #6c63ff;border-radius:8px;color:#6c63ff;font-size:13px;font-weight:700;white-space:nowrap;pointer-events:none;font-family:system-ui,sans-serif;letter-spacing:0.02em;'
    ghost.textContent = `⬡ ${label}`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20)
    setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost) }, 0)
    dragDropSentRef.current = true
    send({ type: 'drag-start', html })
  }
  const onPaletteDragEnd = () => {
    if (dragDropSentRef.current) {
      dragDropSentRef.current = false
      send({ type: 'drag-cancel' }) // clear pending if drop didn't happen
    }
  }

  const palette = makePalette(siteTheme)

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-1)', fontSize: 12 }}>

      {/* ── LEFT: Palette + Layers ── */}
      <div style={{ width: 180, flexShrink: 0, background: 'var(--bg-0)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {([['components', <Package size={11} />, 'Components'] as const, ['layers', <Layers size={11} />, 'Layers'] as const]).map(([tab, icon, label]) => (
            <button key={tab} type="button" onClick={() => setLeftTab(tab)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 4px', border: 'none', background: leftTab === tab ? 'var(--bg-1)' : 'transparent', color: leftTab === tab ? 'var(--accent)' : 'var(--text-2)', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderBottom: leftTab === tab ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Components tab */}
        {leftTab === 'components' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 12px' }}>
            {siteTheme && (
              <div style={{ padding: '5px 10px', fontSize: 9, color: 'var(--text-2)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: toHex(siteTheme.btnBg) || '#6c63ff', display: 'inline-block', flexShrink: 0 }} />
                Adapted to site theme
              </div>
            )}
            {palette.map(group => (
              <div key={group.group}>
                <div style={{ padding: '8px 10px 3px', fontSize: 9, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{group.group}</div>
                {group.items.map(item => (
                  <div key={item.label} draggable
                    onDragStart={e => onPaletteDragStart(e, item.html, item.label)}
                    onDragEnd={onPaletteDragEnd}
                    title={`Drag to canvas to add ${item.label}`}
                    style={{ padding: '5px 10px', cursor: 'grab', borderRadius: 4, fontSize: 12, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6, margin: '1px 6px', userSelect: 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <span style={{ fontSize: 11, opacity: 0.45 }}>⬡</span>{item.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Layers tab */}
        {leftTab === 'layers' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {!domTree ? (
              <div style={{ padding: '20px 12px', color: 'var(--text-2)', fontSize: 11, opacity: 0.5, textAlign: 'center' }}>No content yet</div>
            ) : (
              <TreeNode node={domTree} depth={0} selectedId={selected?.id ?? null} onSelect={selectById} />
            )}
          </div>
        )}
      </div>

      {/* ── CENTER: Canvas ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#e8e8f0', overflow: 'hidden' }}>

        {/* Top toolbar */}
        <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', background: 'var(--bg-0)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {/* Undo / Redo */}
          <button type="button" onClick={() => send({ type: 'undo' })} disabled={!canUndo} title="Undo (Ctrl+Z)"
            style={{ display: 'flex', alignItems: 'center', padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: canUndo ? 'var(--text-0)' : 'var(--text-2)', cursor: canUndo ? 'pointer' : 'not-allowed', fontSize: 10, gap: 3 }}>
            <Undo2 size={11} />
          </button>
          <button type="button" onClick={() => send({ type: 'redo' })} disabled={!canRedo} title="Redo (Ctrl+Y)"
            style={{ display: 'flex', alignItems: 'center', padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: canRedo ? 'var(--text-0)' : 'var(--text-2)', cursor: canRedo ? 'pointer' : 'not-allowed', fontSize: 10, gap: 3 }}>
            <Redo2 size={11} />
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

          {/* Element actions (show when selected) */}
          {selected ? (
            <>
              <code style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3 }}>&lt;{selected.tag}&gt;</code>
              <span style={{ fontSize: 9, color: 'var(--text-2)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{selected.path}</span>
              {isEditingText && <span style={{ fontSize: 9, color: '#d97706', background: '#fef3c7', padding: '1px 5px', borderRadius: 3 }}>✏ editing</span>}
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
              <button type="button" onClick={duplicateSelected} title="Duplicate (Ctrl+D)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10, gap: 3 }}><Copy size={10} /></button>
              <button type="button" onClick={copySelected} title="Copy (Ctrl+C)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10, gap: 3 }}><ClipboardCopy size={10} /></button>
              <button type="button" onClick={moveUp} title="Move up (Ctrl+↑)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10 }}><ArrowUp size={10} /></button>
              <button type="button" onClick={moveDown} title="Move down (Ctrl+↓)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10 }}><ArrowDown size={10} /></button>
              <button type="button" onClick={deselect} title="Deselect" style={{ padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10 }}>✕</button>
              <button type="button" onClick={deleteSelected} title="Delete (Del)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid #fca5a5', borderRadius: 4, background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 10, gap: 3 }}><Trash2 size={10} /></button>
            </>
          ) : (
            <>
              <button type="button" onClick={pasteClipboard} title="Paste (Ctrl+V)" style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10, gap: 3 }}><ClipboardPaste size={10} /> Paste</button>
              <span style={{ fontSize: 10, color: 'var(--text-2)', flex: 1 }}>
                {harnessReady ? '← Drag components · Click element to select' : 'Loading editor…'}
              </span>
            </>
          )}

          <div style={{ flex: 1 }} />

          {/* Zoom */}
          <button type="button" onClick={() => setZoom(z => Math.max(30, z - 10))} title="Zoom out" style={{ display: 'flex', alignItems: 'center', padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer' }}><ZoomOut size={11} /></button>
          <span style={{ fontSize: 10, color: 'var(--text-1)', minWidth: 34, textAlign: 'center' }}>{zoom}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in" style={{ display: 'flex', alignItems: 'center', padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer' }}><ZoomIn size={11} /></button>
          <button type="button" onClick={() => setZoom(100)} title="Reset zoom" style={{ padding: '2px 5px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 10 }}>Reset</button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
          <MousePointer2 size={11} style={{ color: 'var(--text-2)' }} />
        </div>

        {/* iframe with zoom */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#d0d0dc', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: zoom < 100 ? '16px' : '0' }}>
          <div style={{
            width: zoom <= 100 ? `${(100 / zoom) * 100}%` : '100%',
            height: zoom <= 100 ? `${(100 / zoom) * 100}%` : '100%',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
            flexShrink: 0,
          }}>
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }}
              title="Visual Editor Canvas"
            />
          </div>
        </div>

        {/* Source drawer */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--bg-0)', borderTop: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
          onClick={() => setDrawerOpen(o => !o)}>
          {drawerOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>Source HTML</span>
          {drawerOpen && (
            <button type="button" onClick={e => { e.stopPropagation(); void copyHtml() }}
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', background: copied ? 'var(--accent)' : 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10, color: copied ? '#fff' : 'var(--text-1)', cursor: 'pointer' }}>
              <Copy size={9} /> {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        {drawerOpen && (
          <div style={{ height: 150, background: '#07071a', overflow: 'auto', padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#8da3bf', whiteSpace: 'pre-wrap', wordBreak: 'break-all', flexShrink: 0 }}>
            {liveHtml || '<!-- empty -->'}
          </div>
        )}
      </div>

      {/* ── RIGHT: Property panel ── */}
      <div style={{ width: 236, flexShrink: 0, background: 'var(--bg-0)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-0)' }}>Properties</span>
          {selected && <code style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3 }}>{selected.tag}</code>}
        </div>

        {/* Pending banner */}
        {hasPending && (
          <div style={{ padding: '6px 10px', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#92400e', flex: 1 }}>Unsaved changes</span>
            <button type="button" onClick={discardPending} style={{ padding: '2px 7px', background: '#fff', border: '1px solid #fbbf24', borderRadius: 4, fontSize: 10, color: '#92400e', cursor: 'pointer' }}>Discard</button>
            <button type="button" onClick={applyPending} style={{ padding: '2px 8px', background: '#d97706', border: 'none', borderRadius: 4, fontSize: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Apply ↵</button>
          </div>
        )}

        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-2)', padding: 20, textAlign: 'center' }}>
            <MousePointer2 size={28} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.6 }}>Click any element on the canvas to inspect and edit its properties</span>
            <div style={{ fontSize: 10, opacity: 0.35, lineHeight: 1.8, textAlign: 'left', marginTop: 8 }}>
              <div>Del — delete element</div>
              <div>Ctrl+D — duplicate</div>
              <div>Ctrl+C/V — copy/paste</div>
              <div>Ctrl+Z/Y — undo/redo</div>
              <div>Ctrl+↑↓ — reorder</div>
              <div>Dbl-click — edit text</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>

            {/* Align tools */}
            <PropSection label="Align" />
            <div style={{ padding: '6px 12px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {([
                ['left', <AlignLeft size={11} />, 'Align left'],
                ['center', <AlignCenter size={11} />, 'Center'],
                ['right', <AlignRight size={11} />, 'Align right'],
                ['full-w', '↔', 'Full width'],
                ['wrap', '☰', 'Wrap in flex'],
                ['unwrap', '⤴', 'Unwrap'],
              ] as const).map(([dir, icon, tip]) => (
                <button key={dir} type="button" title={tip}
                  onClick={() => dir === 'wrap' ? wrapFlex() : dir === 'unwrap' ? unwrap() : align(dir)}
                  style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 11 }}>
                  {icon}
                </button>
              ))}
            </div>

            {/* Text content */}
            {selected.text !== null && (
              <>
                <PropSection label="Content" />
                <div style={{ padding: '6px 12px' }}>
                  <input value={propText}
                    onChange={e => { setPropText(e.target.value); setPendingText(e.target.value) }}
                    onKeyDown={e => { if (e.key === 'Enter') applyPending() }}
                    style={IN} placeholder="Element text" />
                  <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 3, opacity: 0.7 }}>Or double-click element on canvas to edit inline</div>
                </div>
              </>
            )}

            {/* Typography */}
            <PropSection label="Typography" />
            <PropRow label="Color">
              <input type="color" value={propColor}
                style={{ width: 24, height: 24, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                onChange={e => { setPropColor(e.target.value); stage('color', e.target.value) }} />
              <input value={propColor} style={{ ...IN, width: 68 }}
                onChange={e => { setPropColor(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) stage('color', e.target.value) }} />
            </PropRow>
            <PropRow label="Size">
              <input type="number" value={propFontSize} min={8} max={120}
                style={{ ...IN, width: 56 }}
                onChange={e => { setPropFontSize(+e.target.value); stage('font-size', e.target.value + 'px') }} />
              <span style={{ color: 'var(--text-2)', fontSize: 10 }}>px</span>
            </PropRow>
            <PropRow label="Weight">
              <select value={propFontWeight} style={IN}
                onChange={e => { setPropFontWeight(+e.target.value); stage('font-weight', e.target.value) }}>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </PropRow>
            <PropRow label="Align">
              <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                {(['left', 'center', 'right'] as TextAlign[]).map(a => (
                  <button key={a} type="button" style={pBtn(propTextAlign === a)}
                    onClick={() => { setPropTextAlign(a); stage('text-align', a) }}>
                    {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
                  </button>
                ))}
              </div>
            </PropRow>
            <PropRow label="Line-h">
              <input type="number" value={propLineHeight} min={0.8} max={4} step={0.1}
                style={{ ...IN, width: 56 }}
                onChange={e => { setPropLineHeight(+e.target.value); stage('line-height', e.target.value) }} />
            </PropRow>
            <PropRow label="Spacing">
              <input type="number" value={propLetterSpacing} min={-5} max={20} step={0.5}
                style={{ ...IN, width: 56 }}
                onChange={e => { setPropLetterSpacing(+e.target.value); stage('letter-spacing', e.target.value + 'px') }} />
              <span style={{ color: 'var(--text-2)', fontSize: 10 }}>px</span>
            </PropRow>

            {/* Fill & Border */}
            <PropSection label="Fill & Border" />
            <PropRow label="Fill">
              <input type="color" value={propBg === '#000000' ? '#ffffff' : propBg}
                style={{ width: 24, height: 24, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                onChange={e => { setPropBg(e.target.value); stage('background-color', e.target.value) }} />
              <input value={propBg} style={{ ...IN, width: 68 }}
                onChange={e => { setPropBg(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) stage('background-color', e.target.value) }} />
            </PropRow>
            <PropRow label="Bd color">
              <input type="color" value={propBorderColor}
                style={{ width: 24, height: 24, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                onChange={e => { setPropBorderColor(e.target.value); stage('border-color', e.target.value) }} />
              <input type="number" min={0} max={20} value={propBorderWidth}
                style={{ ...IN, width: 44 }}
                onChange={e => { setPropBorderWidth(+e.target.value); stage('border-width', e.target.value + 'px') }} />
              <span style={{ color: 'var(--text-2)', fontSize: 10 }}>px</span>
            </PropRow>
            <PropRow label="Bd style">
              <select value={propBorderStyle} style={IN}
                onChange={e => { setPropBorderStyle(e.target.value); stage('border-style', e.target.value) }}>
                {['none', 'solid', 'dashed', 'dotted', 'double'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </PropRow>
            <PropRow label="Radius">
              <input type="number" min={0} max={999} value={propBorderRadius}
                style={{ ...IN, width: 56 }}
                onChange={e => { setPropBorderRadius(+e.target.value); stage('border-radius', e.target.value + 'px') }} />
              <span style={{ color: 'var(--text-2)', fontSize: 10 }}>px</span>
            </PropRow>
            <PropRow label="Shadow">
              <input value={propBoxShadow} style={IN} placeholder="0 2px 8px rgba(0,0,0,.1)"
                onChange={e => { setPropBoxShadow(e.target.value); stage('box-shadow', e.target.value || 'none') }} />
            </PropRow>

            {/* Spacing */}
            <PropSection label="Padding" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '6px 12px' }}>
              {([
                ['T', propPadT, setPropPadT, 'padding-top'],
                ['R', propPadR, setPropPadR, 'padding-right'],
                ['B', propPadB, setPropPadB, 'padding-bottom'],
                ['L', propPadL, setPropPadL, 'padding-left'],
              ] as const).map(([label, val, setter, prop]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-2)', width: 9, flexShrink: 0 }}>{label}</span>
                  <input type="number" min={0} max={200} value={val}
                    style={{ ...IN, padding: '2px 4px' }}
                    onChange={e => { setter(+e.target.value); stage(prop, e.target.value + 'px') }} />
                </div>
              ))}
            </div>

            {/* Dimensions */}
            <PropSection label="Dimensions" />
            <PropRow label="Width">
              <input value={propWidth} style={IN} placeholder="auto / 200px / 100%"
                onChange={e => { setPropWidth(e.target.value); stage('width', e.target.value) }} />
            </PropRow>
            <PropRow label="Height">
              <input value={propHeight} style={IN} placeholder="auto / 80px"
                onChange={e => { setPropHeight(e.target.value); stage('height', e.target.value) }} />
            </PropRow>

            {/* Effects */}
            <PropSection label="Effects" />
            <PropRow label="Opacity">
              <input type="range" min={0} max={1} step={0.01} value={propOpacity} style={{ flex: 1 }}
                onChange={e => { setPropOpacity(+e.target.value); stage('opacity', e.target.value) }} />
              <span style={{ fontSize: 10, color: 'var(--text-1)', minWidth: 30, textAlign: 'right' }}>{Math.round(propOpacity * 100)}%</span>
            </PropRow>

            {/* Layout */}
            <PropSection label="Layout" />
            <PropRow label="Display">
              <select value={propDisplay} style={IN}
                onChange={e => { setPropDisplay(e.target.value); stage('display', e.target.value) }}>
                {['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline', 'none'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </PropRow>
            {(propDisplay === 'flex' || propDisplay === 'inline-flex') && (
              <>
                <PropRow label="Dir">
                  <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                    {(['row', 'column'] as FlexDir[]).map(d => (
                      <button key={d} type="button" style={pBtn(propFlexDir === d)}
                        onClick={() => { setPropFlexDir(d); stage('flex-direction', d) }}>
                        {d === 'row' ? '→ Row' : '↓ Col'}
                      </button>
                    ))}
                  </div>
                </PropRow>
                <PropRow label="Gap">
                  <input type="number" min={0} max={80} value={propGap} style={{ ...IN, width: 56 }}
                    onChange={e => { setPropGap(+e.target.value); stage('gap', e.target.value + 'px') }} />
                  <span style={{ color: 'var(--text-2)', fontSize: 10 }}>px</span>
                </PropRow>
              </>
            )}

            {/* Actions */}
            <PropSection label="Actions" />
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={duplicateSelected}
                  style={{ flex: 1, padding: '6px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Copy size={11} /> Duplicate
                </button>
                <button type="button" onClick={wrapFlex}
                  style={{ flex: 1, padding: '6px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  ☰ Wrap flex
                </button>
              </div>
              <button type="button" onClick={deleteSelected}
                style={{ width: '100%', padding: '7px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 500 }}>
                <Trash2 size={12} /> Delete Element
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
