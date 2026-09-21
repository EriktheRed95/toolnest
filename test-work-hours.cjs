const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('tools/work-hours-calculator.html','utf8');
function run(values={}){
 const nodes={};
 for(const m of source.matchAll(/<([a-z]+)\b([^>]*)>/g)){
  const id=m[2].match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
  assert.ok(!nodes[id],`Duplicate DOM id: ${id}`);
  nodes[id]={value:m[2].match(/\bvalue="([^"]*)"/)?.[1]||'',innerHTML:'',addEventListener(){}};
 }
 for(const [id,value] of Object.entries(values))nodes[id].value=value;
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:id=>nodes[id]},Intl});
 assert.equal(nodes['wh-out'].innerHTML,'','result must never be written inside clock-out input');
 return nodes['wh-result'].innerHTML;
}
assert.match(run(),/>8h 0m</);
assert.match(run({'wh-rate':'20'}),/\$160.00/);
assert.match(run({'wh-in':'22:00','wh-out':'06:00','wh-break':'0'}),/>8h 0m</);
assert.match(run({'wh-in':'09:00','wh-out':'09:00','wh-break':'0'}),/>24h 0m</);
assert.match(run({'wh-break':'510'}),/>0h 0m</);
assert.match(run({'wh-rate':''}),/>8h 0m</);
for(const value of ['-1','511','0.5','','Infinity'])assert.match(run({'wh-break':value}),/Enter whole unpaid/);
for(const value of ['-1','Infinity','1e308'])assert.match(run({'wh-rate':value}),/Enter whole unpaid/);
for(const value of ['','24:00','09:90','abc'])assert.match(run({'wh-in':value}),/Enter clock-in/);
console.log('PASS work hours: unique IDs, rendered result, overnight/equal-time convention, pay, invalid inputs');
