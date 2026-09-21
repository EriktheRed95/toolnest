const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function harness(slug,crypto=require('crypto').webcrypto) {
 const nodes={},all=[];
 class El {
  constructor(tag,attrs={}){this.tag=tag;this.attrs=attrs;this.value=attrs.value||'';this.children=[];this.listeners={};this.textContent='';this.style={};all.push(this);if(attrs.id)nodes[attrs.id]=this;}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  appendChild(n){this.children.push(n);}
  set innerHTML(s){this.html=s;this.children=[];for(const m of s.matchAll(/<(input|select|textarea)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/g)){const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];const n=new El(m[1],attrs);if(m[1]==='select')n.value=m[3]?.match(/value="([^"]+)"/)?.[1]||'';if(m[1]==='textarea')n.value=m[3]||'';this.children.push(n);}}
  get innerHTML(){return this.html||'';}
  querySelectorAll(q){return this.children.flatMap(n=>[...(matches(n,q)?[n]:[]),...n.querySelectorAll(q)]);}
  querySelector(q){return this.querySelectorAll(q)[0];}
 }
 function matches(n,q){if(q.startsWith('.'))return n.attrs.class?.split(' ').includes(q.slice(1));if(q==='input[type="text"]')return n.tag==='input'&&n.attrs.type==='text';return false;}
 const source=fs.readFileSync('tools/'+slug+'.html','utf8');
 for(const m of source.matchAll(/<([a-z]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)){const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];new El(m[1],attrs);}
 const document={getElementById:id=>nodes[id],createElement:tag=>new El(tag)};
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{document,Intl,Number,Math,Object,Array,Uint8Array,TextEncoder,Promise,window:{crypto}});
 return {nodes,all,set(id,value){nodes[id].value=value;nodes[id].listeners.input?.();},out(id){return nodes[id].innerHTML;}};
}
let d=harness('debt-payoff-calculator');assert.match(d.out('dp-out'),/Avalanche pays off/);
for(let i=0;i<5;i++)for(const p of ['bal','apr','min'])d.nodes['dp-'+p+i].value='';
d.nodes['dp-bal0'].value='1200';d.nodes['dp-apr0'].value='0';d.nodes['dp-min0'].value='100';d.set('dp-extra','0');assert.match(d.out('dp-out'),/1 yr 0 mo/);assert.match(d.out('dp-out'),/\$0 interest/);
d.set('dp-apr0','100');assert.match(d.out('dp-out'),/No payoff within/);assert.doesNotMatch(d.out('dp-out'),/Avalanche pays off/);
d.set('dp-apr0','');assert.match(d.out('dp-out'),/role="alert"/);d.set('dp-apr0','-5');assert.match(d.out('dp-out'),/role="alert"/);
for(const field of ['name','bal','apr','min'])assert.ok(d.nodes['dp-'+field+'0'].attrs['aria-label']);
let g=harness('gpa-calculator');assert.match(g.out('gp-out'),/>3.50</);
let credits=g.nodes['gp-rows'].querySelectorAll('.gp-cred');credits[0].value='-1';credits[0].listeners.input();assert.match(g.out('gp-out'),/role="alert"/);credits[0].value='Infinity';credits[0].listeners.input();assert.match(g.out('gp-out'),/role="alert"/);credits[0].value='';credits[0].listeners.input();assert.match(g.out('gp-out'),/>3.30</);
g.nodes['gp-add'].listeners.click();assert.equal(g.nodes['gp-rows'].querySelectorAll('.gp-grade').length,5);assert.ok(g.nodes['gp-rows'].querySelectorAll('.gp-cred').every(x=>x.attrs['aria-label']));
(async()=>{
 let h=harness('hash-generator');h.set('hsh-in','abc');await new Promise(r=>setTimeout(r,30));assert.equal(h.nodes['hsh-sha256'].textContent,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 let pending=[];h=harness('hash-generator',{subtle:{digest:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}});await Promise.resolve();h.set('hsh-in','latest');await Promise.resolve();pending.slice(3).forEach(p=>p.resolve(new Uint8Array([2]).buffer));await new Promise(r=>setImmediate(r));pending.slice(0,3).forEach(p=>p.resolve(new Uint8Array([1]).buffer));await new Promise(r=>setImmediate(r));assert.equal(h.nodes['hsh-sha256'].textContent,'02');
 h=harness('hash-generator',{});assert.match(h.nodes['hsh-sha256'].textContent,/unavailable/);
 h=harness('hash-generator',{subtle:{digest:()=>Promise.reject(new Error('expected'))}});await new Promise(r=>setImmediate(r));assert.match(h.nodes['hsh-sha256'].textContent,/could not be generated/);
 console.log('PASS: debt known payoff/non-payoff/invalid, weighted GPA/add/invalid/labels, SHA-256 known vector/race/unavailable/failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
