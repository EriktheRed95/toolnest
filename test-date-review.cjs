const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('tools/date-difference-calculator.html','utf8');
const nodes={};for(const id of ['dd-start','dd-end','dd-out'])nodes[id]={value:'',innerHTML:'',addEventListener(type,fn){this.run=fn;}};
vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:id=>nodes[id]}});
nodes['dd-start'].value='0000-01-01';nodes['dd-end'].value='0001-01-01';nodes['dd-start'].run();
assert.match(nodes['dd-out'].innerHTML,/role="alert"/,'HTML dates and stated range exclude year zero');
console.log('PASS independent date review: reject year zero');
