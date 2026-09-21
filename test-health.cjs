const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function run(file,overrides={},radios={}) {
 const source=fs.readFileSync('tools/'+file+'.html','utf8'),nodes={},groups={};
 for(const m of source.matchAll(/<([a-z]+)\b([^>]*)>/g)) {const a={};for(const z of m[2].matchAll(/([\w-]+)="([^"]*)"/g))a[z[1]]=z[2];const n={value:a.value||'',innerHTML:'',style:{},addEventListener(){}};
 if(m[1]==='select'){const body=source.slice(m.index).split('</select>')[0];n.value=body.match(/<option value="([^"]+)" selected/)?.[1]||body.match(/<option value="([^"]+)"/)?.[1]||'';}
 if(a.id){nodes[a.id]=n;if(a.id in overrides)n.value=overrides[a.id];}if(a.name&&/checked/.test(m[2]))groups[a.name]=n;
 }
 const document={getElementById:id=>nodes[id],querySelector:s=>{let group=s.match(/name="([^"]+)"/)[1];return {value:radios[group]||groups[group].value};},querySelectorAll:()=>[]};
 for(const m of source.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(m[1],{document,Intl,Number,Math,isFinite});
 return Object.values(nodes).map(x=>x.innerHTML).join('\n');
}
assert.match(run('bmi-calculator'),/>23.5</);assert.match(run('bmi-calculator',{'bmi-cm':'200','bmi-kg':'100'}),/Overweight/);
for(const v of ['', 'Infinity','1e308','-5'])assert.match(run('bmi-calculator',{'bmi-cm':v}),/Enter finite/);
assert.match(run('bmi-calculator',{'bmi-in':'-1'},{'bmi-unit':'imperial'}),/Enter finite/);
assert.match(run('ideal-weight-calculator',{'iw-cm':'20'}),/not shown below 5 feet/);assert.doesNotMatch(run('ideal-weight-calculator',{'iw-cm':'20'}),/-\d+\.\d kg/);
assert.match(run('ideal-weight-calculator',{'iw-cm':'152.4'}),/50.0 kg/);
assert.match(run('ideal-weight-calculator',{'iw-cm':'Infinity'}),/Enter a finite/);
assert.match(run('body-fat-calculator'),/17.2%/);
assert.match(run('body-fat-calculator',{'bf-neck':'90'}),/Waist must/);
assert.match(run('body-fat-calculator',{'bf-height':'Infinity'}),/Enter your height/);
assert.match(run('body-fat-calculator',{'bf-hip':''},{'bf-sex':'female'}),/Enter your height/);
assert.match(run('tdee-calculator'),/2,587 kcal\/day/);
for(const v of ['17','0','','Infinity','150'])assert.match(run('tdee-calculator',{'td-age':v}),/Enter adult age/);
assert.match(run('tdee-calculator',{'td-age':'100','td-cm':'120','td-kg':'30','td-act':'1.2'},{'td-sex':'female'}),/Not displayed/);
assert.match(run('tdee-calculator',{'td-age':'120','td-cm':'1','td-kg':'1'},{'td-sex':'female'}),/do not produce a valid/);
console.log('PASS: health default values, adult scope, invalid/nonfinite inputs, short height and calorie guards');

assert.match(run('bmi-calculator',{'bmi-cm':'1e-200'}),/Enter finite/);
