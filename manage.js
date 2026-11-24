// Catalog maintenance and paired accounting corrections. The caller saves the book once.
function activeIds(book=state){
  return Object.keys(book.catalog).filter(id=>!book.catalog[id].archived);
}
function referenced(book,id){
  return book.lots.some(l=>l.item===id)||book.events.some(e=>e.id===id||e.lines?.some(l=>l.item===id));
}
function usersOf(book,id){
  return Object.values(book.catalog).some(i=>Object.hasOwn(i.components||{},id));
}
function docActions(e){
  if(e.status!=='posted'||e.op==='reverse'||state.events.some(r=>r.source===e.doc))return '';
  if(isPos&&!['sale','prep'].includes(e.op))return '';
  return '<button class="secondary" data-manage="correct" data-key="'+e.doc+'">تصحيح المستند</button> <button class="secondary" data-manage="void" data-key="'+e.doc+'">إلغاء المستند</button>';
}
function manageButton(action,id,label){
  return '<button class="lotlink" data-manage="'+action+'" data-key="'+id+'">'+label+'</button>';
}
function catalogActions(id){
  if(state.catalog[id].archived)return manageButton('restore',id,'استعادة');
  return manageButton('edit',id,'تعديل')+' '+manageButton('remove',id,referenced(state,id)?'أرشفة':'حذف');
}
function selectable(op,id){
  const i=state.catalog[id];
  return !i.archived&&(op!=='prep'||i.type==='manufactured')&&(op!=='receive'||i.type!=='manufactured');
}
function manageForm(action,id){
  const financial=['correct','void'].includes(action);
  const src=state.events.find(e=>e.doc===id);
  if(financial?!src||!docActions(src):isPos)return;
  const item=state.catalog[id];
  const titles={edit:'تعديل الصنف',remove:'حذف أو أرشفة الصنف',restore:'استعادة الصنف',correct:'تصحيح المستند',void:'إلغاء المستند',clearPrice:'إزالة سعر البيع',resetPolicy:'استعادة سياسة التسعير الافتراضية'};
  if(!Object.hasOwn(titles,action))return;
  mode='manage';
  const fields=$('fields');
  fields.dataset.action=action;fields.dataset.target=id;
  fields.dataset.start=JSON.stringify(action==='resetPolicy'?state.policy:action==='clearPrice'?state.prices[id]:item??null);
  let body='';
  if(action==='edit'){
    const locked=referenced(state,id)||usersOf(state,id);
    body='<label for="editName">اسم الصنف</label><input id="editName" maxlength="80" required><label for="editUnit">وحدة المخزون</label><input id="editUnit" maxlength="20" required '+(locked?'readonly':'')+'>'+
      selectField('editType','نوع الصنف',types,item.type)+'<div id="editRecipe"></div>';
    if(locked)body+='<p class="note">الوحدة والنوع مرتبطان بحركات أو تركيبات مسجّلة.</p>';
  }else if(action==='correct'){
    body='<p>يُعكس المستند '+serial(id)+' ويُرحّل بديله معاً. يُقيَّم التصنيع بالتكلفة والتركيبة الحاليتين.</p>';
    if(['receive','sale','prep','waste'].includes(src.op)){
      const ids=activeIds().filter(k=>selectable(src.op,k));
      body+='<label for="changeItem">الصنف</label><select id="changeItem">'+ids.map(k=>'<option value="'+k+'" '+(k===src.id?'selected':'')+'>'+items[k][0]+'</option>').join('')+'</select><label for="changeQty">الكمية</label><input id="changeQty" type="number" min="1" step="1" required value="'+src.q+'">';
    }
    if(src.op==='expense')body+=selectField('changeCategory','المصروف',Object.fromEntries(Books.categories.map(k=>[k,Books.accounts[k]])),src.id);
    if(['capital','expense','opening','receive','sale'].includes(src.op)){
      const price=src.op==='receive'?src.lines[0].cost:src.op==='opening'?src.openingCost:src.op==='sale'?src.lines[0].sell:src.amount/100;
      body+=numberField('changeValue',src.op==='sale'?'سعر بيع الوحدة':src.op==='receive'||src.op==='opening'?'تكلفة الوحدة':'المبلغ',price);
    }
    if(['receive','sale','expense'].includes(src.op))body+=paymentField();
    if(src.op==='sale')body+='<div id="fallback"></div>';
  }else{
    const prompts={void:'سيُنشأ سند عكسي للمستند '+(financial?serial(id):'')+'.',remove:referenced(state,id)?'تُؤرشف المادة وتبقى حركاتها محفوظة.':'سيُحذف تعريف الصنف غير المستخدم.',restore:'سيعود الصنف إلى قائمة المواد المتاحة.',clearPrice:'تتوقف المبيعات الجديدة لهذا الصنف حتى تحديد سعر جديد.',resetPolicy:'إضافة ٢٥٪، وتقريب إلى ٠٫٠١، مع تحذير عند البيع بخسارة.'};
    body='<p>'+prompts[action]+'</p>';
  }
  $('dt').textContent=titles[action];$('submit').textContent=financial?'تأكيد الترحيل':'تأكيد';$('error').textContent='';fields.innerHTML=body;
  if(action==='edit'){
    $('editName').value=item.name;$('editUnit').value=item.unit;
    $('editType').disabled=referenced(state,id)||usersOf(state,id);
    const recipe=()=>$('editRecipe').innerHTML=$('editType').value==='manufactured'?componentFields(item.components||{}):'';
    $('editType').onchange=recipe;recipe();
  }
  if($('pay'))$('pay').value=src.payment;
  if(src?.op==='sale'&&action==='correct'){
    const preview=()=>lossControl(getPrice('changeValue'),Books.averageCost(state,$('changeItem').value));
    $('changeValue').oninput=preview;$('changeItem').onchange=preview;preview();
  }
  if($('document').open)$('document').close();
  if(!$('modal').open)$('modal').showModal();
}
function applyManagement(book,action,id,v){
  const fail=msg=>{throw Error(msg)};
  if(['void','correct'].includes(action)){
    const src=book.events.find(e=>e.doc===id);
    if(!src||isPos&&!['sale','prep'].includes(src.op))fail('المستند غير متاح لهذا الدور.');
    const undo=Books.post(book,'reverse',null,1,{source:id});
    if(action==='void')return undo;
    const target=v.item||src.id;
    if(book.catalog[target]?.archived)fail('استعد الصنف المؤرشف قبل ترحيل المستند.');
    const opts={amount:v.value,cost:v.value,payment:v.payment||src.payment,approved:v.approved};
    const price=book.prices[target];
    if(src.op==='sale')Books.setPrice(book,target,v.value,v.approved);
    const replacement=Books.post(book,src.op,target,v.qty??src.q,opts);
    if(src.op==='sale')book.prices[target]=price;
    replacement.corrects=id;undo.replacement=replacement.doc;
    return replacement;
  }
  if(isPos)fail('هذه العملية متاحة للإدارة فقط.');
  const item=book.catalog[id];
  if(action==='resetPolicy'){Books.setPolicy(book,{kind:'markup',rate:25,step:0.01,loss:'warn'});return}
  if(!item)fail('الصنف غير موجود.');
  if(action==='clearPrice'){book.prices[id]=null;return}
  if(action==='restore'){delete item.archived;return}
  if(action==='remove'){
    if(book.stock[id]||usersOf(book,id))fail('يجب تصفير رصيد الصنف وفك ارتباطه بالتركيبات أولاً.');
    if(referenced(book,id)){item.archived=true;return}
    for(const key of ['catalog','stock','value','avg','lastAvg','pending','prices'])if(book[key])delete book[key][id];
    return;
  }
  if(action!=='edit')fail('عملية غير معروفة.');
  if(!v.name||v.name.length>80||!v.unit||v.unit.length>20||!Object.hasOwn(types,v.type))fail('راجع اسم الصنف ووحدته ونوعه.');
  if(Object.entries(book.catalog).some(([k,i])=>k!==id&&i.name===v.name))fail('اسم الصنف مستخدم.');
  if((referenced(book,id)||usersOf(book,id))&&(v.unit!==item.unit||v.type!==item.type))fail('لا يمكن تغيير وحدة أو نوع صنف مرتبط.');
  for(const e of book.events){
    if(e.id===id||e.lines?.some(l=>l.item===id)){e.labels??={};e.labels[id]??={name:item.name,unit:item.unit,type:item.type}}
  }
  Object.assign(item,{name:v.name,unit:v.unit,type:v.type});
  if(v.type==='manufactured')item.components=v.components;else delete item.components;
}
function submitManagement(book){
  const {action,target,start}=$('fields').dataset;
  const current=action==='resetPolicy'?book.policy:action==='clearPrice'?book.prices[target]:book.catalog[target]??null;
  if(JSON.stringify(current)!==start)throw Error('تغيّرت البيانات، افتح المستند أو الصنف مجدداً.');
  const v={item:$('changeItem')?.value||$('changeCategory')?.value,qty:getPrice('changeQty')??undefined,value:getPrice('changeValue'),payment:$('pay')?.value,approved:$('approveLoss')?.checked};
  if(action==='edit'){
    v.name=$('editName').value.trim();v.unit=$('editUnit').value.trim();v.type=$('editType').value;
    if(v.type==='manufactured')v.components=readComponents(book.catalog);
  }
  return applyManagement(book,action,target,v);
}
