const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
for(const role of ['admin','pos']){
 const nodes=new Map(),storage=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',dataset:{},value:'',addEventListener(){},querySelectorAll(){return []},classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
 const ctx=vm.createContext({window:{addEventListener(){}},document:{getElementById:get,querySelectorAll(){return []}},location:{hash:'#home'},localStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)},clearTimeout(){},setTimeout(){},assert,console});
 vm.runInContext(source('manage.js'),ctx);
 for(const m of source(role+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],ctx);
 vm.runInContext(`
 const book=Books.empty({});book.catalog={};book.catalog.a={name:'خبز',unit:'قطعة',type:'raw'};
 book.avg.a=book.value.a=book.stock.a=0;book.prices.a=100;
 const receive=Books.post(book,'receive','a',10,{cost:50});
 const sale=Books.post(book,'sale','a',3);
 const corrected=applyManagement(book,'correct',sale.doc,{item:'a',qty:2,value:95,payment:'credit'});
 assert.equal(book.stock.a,8);assert.equal(book.prices.a,100);assert.equal(corrected.amount,19000);
 assert.equal(corrected.corrects,sale.doc);assert.equal(Books.report(book).balance.ar,19000);
 assert.throws(()=>applyManagement(book,'void',sale.doc,{}));
 applyManagement(book,'void',corrected.doc,{});
 assert.equal(book.stock.a,10);assert.equal(Books.report(book).balance.ar,0);
 if(!isPos){
 applyManagement(book,'edit','a',{name:'خبز جديد',unit:'قطعة',type:'raw'});
 assert.equal(sale.labels.a.name,'خبز');
 assert.throws(()=>applyManagement(book,'remove','a',{}));
 const expense=Books.post(book,'expense','gas',1,{amount:20});
 applyManagement(book,'correct',expense.doc,{item:'electricity',value:30,payment:'cash'});
 assert.equal(Books.report(book).expenses,3000);
 applyManagement(book,'void',receive.doc,{});
 applyManagement(book,'remove','a',{});assert.equal(book.catalog.a.archived,true);
 applyManagement(book,'restore','a',{});assert.ok(!book.catalog.a.archived);
 }
 else assert.throws(()=>applyManagement(book,'edit','a',{name:'wrong'}));
 `,ctx);
 console.log(role+' passed');
}
