const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('tools/age-calculator.html','utf8');
function run(b,a){
 const nodes={};for(const id of ['ag-dob','ag-as','ag-out'])nodes[id]={value:'',innerHTML:'',addEventListener(type,fn){this.run=fn;}};
 vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:id=>nodes[id]},Intl,Date});
 nodes['ag-dob'].value=b;nodes['ag-as'].value=a;nodes['ag-as'].run();return nodes['ag-out'].innerHTML;
}
assert.match(run('2026-01-31','2026-03-01'),/>0 yr 1 mo 1 d</);
assert.match(run('2026-01-31','2026-02-28'),/>0 yr 1 mo 0 d</);
assert.match(run('2024-02-29','2025-02-28'),/>1 yr 0 mo 0 d</);
assert.match(run('2024-02-29','2025-03-01'),/>1 yr 0 mo 1 d</);
assert.match(run('2024-02-29','2025-02-28'),/Today!/);
assert.match(run('2024-02-29','2026-02-27'),/in 1 day</);
assert.match(run('2026-03-08','2026-03-09'),/In total days<\/span><span class="v">1 days/);
assert.match(run('2026-01-01','2026-01-01'),/>0 yr 0 mo 0 d</);
assert.match(run('2026-02-30','2026-03-01'),/Enter valid dates/);
assert.match(run('0001-01-01','0002-01-01'),/>1 yr 0 mo 0 d</);
assert.match(run('2026-03-01','2026-02-28'),/before the date of birth/);
assert.match(run('','2026-03-01'),/Enter a date of birth/);
console.log('PASS age: end of month, leap birthday convention, DST-independent totals, year 0001, invalid dates');
