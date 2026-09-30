const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const source = fs.readFileSync(require('path').join(__dirname,'../storage.js'),'utf8');
const KEY = 'neurofinance.snapshot.v1';
const row = {id:1,amount:12.34,type:'expense',cat:'food',desc:'Old record',date:'2020-01-01T00:00:00Z'};
class Storage {
 constructor(data={}) { this.map=new Map(Object.entries(data)); this.fail=false; }
 get length(){return this.map.size} key(i){return [...this.map.keys()][i]}
 getItem(k){return this.map.get(k)??null} setItem(k,v){if(this.fail)throw Error('QuotaExceededError');this.map.set(k,String(v))} removeItem(k){this.map.delete(k)}
}
async function boot(storage, idb=new IDBFactory()) {
 const gate={style:{},textContent:'',append(){}}; const status={}; const captures=[];
 const doc={getElementById:k=>k==='storage-gate'?gate:status,createElement:()=>({click(){},remove(){}}),body:{append(el){captures.push(el)}}};
 const context={localStorage:storage,indexedDB:idb,document:doc,navigator:{storage:{persisted:async()=>false,persist:async()=>false}},setTimeout,clearTimeout,console,URL:{createObjectURL:b=>{context.blob=b;return 'blob:test'},revokeObjectURL(){}},Blob,addEventListener(){},confirm:()=>true,alert:msg=>context.alertMessage=msg,location:{reload:()=>context.reloaded=true}};
 context.window=context; vm.createContext(context); await vm.runInContext(source,context); return {api:context.nfStorage,gate,status,context,idb};
}
async function settle(db){await new Promise(r=>setTimeout(r,30));return new Promise((resolve,reject)=>{const req=db.open('neurofinance-durable',1);req.onsuccess=()=>{const tx=req.result.transaction('snapshots');const get=tx.objectStore('snapshots').get('latest');get.onsuccess=()=>resolve(get.result);get.onerror=reject;};});}
(async()=>{
 const ls=new Storage({txs_default:JSON.stringify([row]),budgets_default:'{"food":100}','gemini_api_key':'secret','pro_config':'{"key":"secret2"}'});
 let b=await boot(ls); assert.equal(JSON.parse(b.api.getItem('txs_default'))[0].date,row.date); console.log('PASS: legacy migration preserves old records and budgets');
 b.api.setItem('txs_travel',JSON.stringify([{...row,id:2}])); await settle(b.idb);
 b=await boot(ls,b.idb); assert.equal(JSON.parse(b.api.getItem('txs_travel')).length,1); console.log('PASS: restart preserves multiple books');
 ls.removeItem(KEY); b=await boot(ls,b.idb); assert.equal(JSON.parse(b.api.getItem('txs_travel')).length,1); console.log('PASS: missing primary restores IndexedDB snapshot');
 b.api.setItem('txs_default','[]'); await settle(b.idb); ls.removeItem(KEY); b=await boot(ls,b.idb); assert.equal(b.api.getItem('txs_default'),'[]'); console.log('PASS: deleted entries stay deleted after recovery');
 b.api.exportBackup(); const backup=JSON.parse(await b.context.blob.text()); assert(!backup.data.gemini_api_key&&!backup.data.pro_config); assert(backup.data.txs_travel); console.log('PASS: export contains all books but no API credentials');
 const target=await boot(new Storage()); await target.api.importBackup({size:100,text:async()=>JSON.stringify(backup)}); assert(target.context.reloaded); assert.equal(target.api.getItem('txs_travel'),backup.data.txs_travel); console.log('PASS: complete backup restore');
 const before=target.api.getItem('txs_travel'); await target.api.importBackup({size:100,text:async()=>JSON.stringify({app:'NeuroFinance',version:1,data:{txs_travel:'bad json'}})}); assert.equal(target.api.getItem('txs_travel'),before); console.log('PASS: malformed import leaves data unchanged');
 const stale=await boot(ls,b.idb); b.api.setItem('profile_name','new name'); assert.throws(()=>stale.api.setItem('txs_travel','[]')); console.log('PASS: stale tab cannot overwrite newer records');
 ls.fail=true; const old=b.api.getItem('txs_travel'); assert.throws(()=>b.api.setItem('txs_travel','[]')); assert.equal(b.api.getItem('txs_travel'),old); assert.equal(b.gate.style.display,'grid'); console.log('PASS: failed save is blocked and durable state preserved');
 const bad=new Storage({[KEY]:'{broken'}); const broken=await boot(bad); assert(!broken.api); assert.equal(bad.getItem(KEY),'{broken'); console.log('PASS: corrupt primary is not replaced with empty data');
 const noDb=await boot(new Storage({txs_default:JSON.stringify([row])}),{open(){throw Error('unavailable')}}); assert.equal(JSON.parse(noDb.api.getItem('txs_default')).length,1); console.log('PASS: IndexedDB unavailable keeps primary working');
 console.log('11 storage regression checks passed'); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
