const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('tools/mortgage-recast-calculator.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function run(overrides={}){const inputs={'rc-balance':300000,'rc-rate':6.5,'rc-remain':28,'rc-lump':50000,'rc-fee':250,...overrides};const nodes={};for(const [id,value]of Object.entries(inputs))nodes[id]={value:String(value),addEventListener(){}};nodes['rc-out']={innerHTML:''};vm.runInNewContext(code,{document:{getElementById:id=>nodes[id]},Intl,Number,Math});return nodes['rc-out'].innerHTML;}
const valid=run();assert(!/NaN|Infinity/.test(valid));assert(valid.includes('$1,617.54'));assert(!valid.includes('same interest'));
for(const bad of [{'rc-remain':0},{'rc-remain':41},{'rc-rate':-1},{'rc-balance':''},{'rc-lump':-1},{'rc-fee':-1}])assert(run(bad).includes('role="alert"'));
assert(run({'rc-rate':0}).includes('$744.05'));assert(run({'rc-lump':300000}).includes('Paid off by lump sum'));assert(run({'rc-lump':999999}).includes('A recast is unnecessary'));console.log('Recast calculation / invalid-input checks passed');


assert(run({'rc-remain':28.4}).includes('28 years 5 months'));assert(!/NaN|Infinity/.test(run({'rc-balance':0})));

assert(run({'rc-rate':1e9}).includes('role="alert"'));assert(run({'rc-balance':1e300}).includes('role="alert"'));

assert(!/NaN|Infinity/.test(run({'rc-rate':'1e-20'})));
