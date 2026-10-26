import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const originalUiSha256 = '6616b1e9ffe6f19627c9736d5f8e803e644014f383276a850c2b620f3a98e82a';
const originalUiLength = 2417;
const MASTER = '1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E';
const PRIVATE = 'LIBRO_EDITORIAL_PRIVADO_DE_ENSAYO_123456';
const ORIGINAL = 'ORIGINAL_DRIVE_PRIVADO_DE_ENSAYO_123456';
const LAB = 'LABORATORIO_DE_ENSAYO_123456';
const keys = ['fecha','titulo','celebracion','cita','evangelioTitulo','evangelio','pistas','estoyEmpezando','fraseDestacada','imagenDiaUrl','audioUrl','notificacionTitulo','notificacionTexto','notasInternas'];
const headers = ['fecha','publicar',...keys.slice(1)];
const studyHeaders = ['fecha','cita','titulo','contenidoMarkdown','publicar'];
const content = (changes = {}) => ({fecha:'2026-10-27',titulo:'Martes, 27 de octubre',celebracion:'Semana XXX del tiempo ordinario',cita:'Lc 13, 18-21',evangelioTitulo:'Evangelio según san Lucas 13, 18-21',evangelio:'Texto recibido para ensayo.',pistas:'    Pistas recibidas intactas.\n    Otro párrafo.',estoyEmpezando:'Antes de leer: Espíritu Santo.\nPara entender: Texto.\nPara rezar: Relee el Evangelio.',fraseDestacada:'Pistas recibidas intactas.',imagenDiaUrl:'',audioUrl:'',notificacionTitulo:'M recibida',notificacionTexto:'Invitación propia.',notasInternas:'',...changes});
const study = (changes = {}) => ({titulo:'Estudio completo',contenidoMarkdown:'# Estudio A\n\nTexto del estudio sintético.\n\n## Oración\nPreguntas.\n\n## Fuentes\nFuente de ensayo.',publicar:false,originalDriveId:ORIGINAL,...changes});
const extended = (item = content(), a = study(), more = {}) => ({perfil:'pistas-prod-1',dias:[{contenido:item,...(a === undefined ? {} : {estudioBiblico:a}),...more}]});
const row = (item = content(), publish = 'sí') => [item.fecha,publish,...keys.slice(1).map(k=>item[k])];
const studyRow = (date='2026-10-27', publish='sí', a='A sintética aprobada') => [date,'Lc 13, 18-21','Título de ensayo',a,publish];
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function harness(options = {}) {
  const events = [], mutations = [], properties = {PISTAS_PROD_ENABLED:'true',PISTAS_ESTUDIOS_PRIVADOS_ID:PRIVATE,...options.properties};
  const books = new Map(), triggers = (options.triggers || []).map(handler => ({getHandlerFunction:()=>handler}));
  let waits = 0, releases = 0, triggerCreates = 0;
  function makeBook(id, role) {
    const sheets = new Map();
    const book = {id,role,sheets,getId:()=>id,getSheetByName:name=>sheets.get(name)||null,
      insertSheet(name) {mutations.push({type:'insertSheet',role,name});return makeSheet(book,name,[]);}};
    books.set(id,book);return book;
  }
  function makeSheet(book,name,inputRows) {
    const data=inputRows.map(r=>r.slice()),formats=[];let maxRows=options.maxRows?.[book.role]?.[name]??1000;
    const sheet={data,formats,name,role:book.role,
      getLastRow(){let n=data.length;while(n&&(!data[n-1]||data[n-1].every(v=>v==='')))n--;return n;},
      getLastColumn(){return data.reduce((max,r)=>Math.max(max,r.reduce((n,v,j)=>v===''?n:j+1,0)),0);},
      getMaxColumns(){return options.maxColumns?.[book.role]?.[name]??26;},getMaxRows(){return maxRows;},
      insertRowsAfter(after,count){mutations.push({type:'insertRowsAfter',role:book.role,name,after,count});maxRows+=count;return sheet;},
      getRange(r,c,n,m){assert(r>=1&&c>=1&&n>=1&&m>=1);return {
        getValues(){if(options.failRead===book.role+':'+name)throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r+i-1]?.[c+j-1]??''));},
        getFormulas(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>options.formulas?.[book.role]?.[name]?.[r+i-1]?.[c+j-1]??''));},
        setNumberFormat(format){mutations.push({type:'format',role:book.role,name,r,c,n,m,format});for(let i=0;i<n;i++)for(let j=0;j<m;j++){formats[r+i-1]??=[];formats[r+i-1][c+j-1]=format;}return this;},
        clearContent(){events.push({type:'clear',role:book.role,name,r,c,n,m});mutations.push({type:'clear',role:book.role,name,r,c,n,m});if(options.failClear)throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(data[r+i-1])data[r+i-1][c+j-1]='';return this;},
        setValues(values){
          events.push({type:'values',role:book.role,name,r,c,n,m});mutations.push({type:'values',role:book.role,name,r,c,n,m});
          if(options.failWrite===book.role+':'+name&&r>1)throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');
          assert.equal(values.length,n);values.forEach(v=>assert.equal(v.length,m));assert(r+n-1<=maxRows);
          values.forEach((v,i)=>{data[r+i-1]??=[];v.forEach((value,j)=>{
            data[r+i-1][c+j-1]=options.simulateTitleDateCoercion&&book.role==='master'&&name==='Contenido'&&c+j===3&&formats[r+i-1]?.[c+j-1]!=='@'?46322:value;
          });});return this;
        }
      };}
    };book.sheets.set(name,sheet);return sheet;
  }
  const master=makeBook(MASTER,'master'),privado=makeBook(PRIVATE,'private');
  makeSheet(master,'Contenido',options.contentRows??[headers]);
  if(options.publicRows!==undefined)makeSheet(master,'Estudios',options.publicRows);
  if(options.privateRows!==null)makeSheet(privado,'Estudios',options.privateRows??[studyHeaders]);
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[options.now??'2026-10-27T12:00:00Z']));}}
  const lock={waitLock(ms){events.push({type:'lock',ms});if(options.failLock)throw new Error('LOCK_TIMEOUT');waits++;},releaseLock(){events.push({type:'release'});releases++;}};
  const props={getProperty:k=>properties[k]??null,getProperties:()=>({...properties}),setProperties(values,remove){
    assert.equal(remove,false);mutations.push({type:'properties',keys:Object.keys(values)});
    if(options.failOriginalProperties&&Object.keys(values).some(k=>k.startsWith('PISTAS_PROD_ORIGINAL_')))throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');
    Object.assign(properties,values);
  }};
  const services={Date:ClockDate,SpreadsheetApp:{getActiveSpreadsheet:()=>options.activeId==='NONE'?null:options.activeId?{getId:()=>options.activeId}:master,
    openById(id){events.push({type:'open',role:id===MASTER?'master':'private'});if(!books.has(id))throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');return books.get(id);}},
    PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>lock,getDocumentLock(){throw new Error('DocumentLock no coordina este candidato');}},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById(id){assert.equal(id,PRIVATE);events.push({type:'privacy'});return{getSharingAccess(){if(options.failPrivacy)throw new Error('CONTENIDO_PRIVADO_NO_DIVULGAR');return options.sharingAccess??'PRIVATE';}};}},
    Utilities:{formatDate(date,zone,format){assert.equal(zone,'Europe/Madrid');assert.equal(format,'yyyy-MM-dd');const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`;}},
    ScriptApp:{getProjectTriggers:()=>triggers,newTrigger(handler){const builder={timeBased(){return this;},atHour(n){assert.equal(n,0);return this;},nearMinute(n){assert.equal(n,30);return this;},everyDays(n){assert.equal(n,1);return this;},inTimezone(zone){assert.equal(zone,'Europe/Madrid');return this;},create(){mutations.push({type:'trigger'});triggerCreates++;triggers.push({getHandlerFunction:()=>handler});}};return builder;}}};
  const context=vm.createContext(services);vm.runInContext(source,context,{filename:'Codigo.produccion.gs'});
  return {master,privado,properties,events,mutations,context,stats:()=>({waits,releases,triggerCreates}),run:input=>context.procesarJsonImportado(typeof input==='string'?input:JSON.stringify(input)),sync:()=>context.sincronizarEstudiosPublicados(),setup:()=>context.prepararActivadorDiarioEstudios()};
}
const results=[];
function check(name,run){run();results.push({name,passed:true});}
function rejectWithoutWrites(h,fn,pattern){assert.throws(fn,pattern);assert.equal(h.mutations.length,0,'Reject before any write or export clear');}
const publicData=h=>h.master.sheets.get('Estudios')?.data??[];
const allPublic=h=>JSON.stringify([...h.master.sheets.values()].map(s=>s.data));

check('Original menu/dialog and legacy 14-key A:O survive; B and M keep their meanings',()=>{
  const ui=source.slice(0,originalUiLength);assert.equal(digest(ui),originalUiSha256);
  const h=harness({contentRows:[headers,row(content(),'no')]});h.run([content({pistas:'    Corrección recibida.'})]);
  assert.equal(h.master.sheets.get('Contenido').data[1][1],'no');assert.equal(h.master.sheets.get('Contenido').data[1][12],'M recibida');
  assert.equal(h.privado.sheets.get('Estudios').data.length,1);assert.equal(allPublic(h).includes(ORIGINAL),false);
});
check('Disabled/default guard, wrong master and unsafe private IDs prevent every mutation',()=>{
  for(const options of [{properties:{PISTAS_PROD_ENABLED:'false'}},{properties:{PISTAS_PROD_ENABLED:undefined}},{activeId:'OTRO_LIBRO'},
    {properties:{PISTAS_ESTUDIOS_PRIVADOS_ID:MASTER}},{properties:{PISTAS_ESTUDIOS_PRIVADOS_ID:LAB,PISTAS_LAB_SHEET_ID:LAB}},
    {properties:{PISTAS_ESTUDIOS_PRIVADOS_ID:''}}]){
    const h=harness(options);rejectWithoutWrites(h,()=>h.run(extended()),/desactivado|maestro|privado/);assert.deepEqual(h.stats(),{waits:1,releases:1,triggerCreates:0});
  }
});
check('Live privacy guard rejects general access on import and on sync; native errors disclose no private data',()=>{
  for(const sharingAccess of ['ANYONE','ANYONE_WITH_LINK','DOMAIN','DOMAIN_WITH_LINK'])for(const action of ['run','sync']){
    const h=harness({sharingAccess});rejectWithoutWrites(h,()=>action==='run'?h.run(extended()):h.sync(),/acceso general/);
  }
  const h=harness({failPrivacy:true});try{h.run(extended());assert.fail('Expected failure');}catch(e){assert.equal(e.message.includes('CONTENIDO_PRIVADO_NO_DIVULGAR'),false);}assert.equal(h.mutations.length,0);
});
check('Draft A is stored only privately; original Drive ID appears only in properties',()=>{
  const h=harness();const a=study();h.run(extended(content(),a));
  assert.equal(digest(h.privado.sheets.get('Estudios').data[1][3]),digest(a.contenidoMarkdown));
  assert.equal(allPublic(h).includes(a.contenidoMarkdown),false);assert.equal(allPublic(h).includes(ORIGINAL),false);
  assert.equal(JSON.stringify(h.privado.sheets.get('Estudios').data).includes(ORIGINAL),false);
  assert.equal(h.properties['PISTAS_PROD_ORIGINAL_2026-10-27'],ORIGINAL);assert.equal(publicData(h).length,1);
});
check('Only approved due studies export; publication is independent of Contenido B',()=>{
  const today=studyRow('2026-10-27','sí','A_APROBADA_HOY'),past=studyRow('2026-10-26','sí','A_APROBADA_AYER');
  const h=harness({contentRows:[headers,row(content(),'no')],privateRows:[studyHeaders,today,studyRow('2026-10-28','sí','A_FUTURA_PRIVADA'),studyRow('2026-10-25','no','A_BORRADOR_PRIVADA'),past]});h.sync();
  assert.equal(digest(publicData(h)),digest([studyHeaders,past,today]));assert.equal(allPublic(h).includes('A_FUTURA_PRIVADA'),false);assert.equal(allPublic(h).includes('A_BORRADOR_PRIVADA'),false);
});
check('A future approved study remains private until its Madrid date',()=>{
  const h=harness({now:'2026-10-26T12:00:00Z'});const a=study({publicar:true});h.run(extended(content(),a));assert.equal(publicData(h).length,1);
  assert.equal(h.privado.sheets.get('Estudios').data[1][4],'sí');assert.equal(allPublic(h).includes(a.contenidoMarkdown),false);
});
check('Reimport updates both books by date and preserves unrelated content, media and B',()=>{
  const prior=content({fecha:'2026-10-26',cita:'Lc 13, 10-17',titulo:'Lunes, 26 de octubre'}),current=content({imagenDiaUrl:'https://example.invalid/approved.png',audioUrl:'https://example.invalid/approved.mp3'});
  const h=harness({contentRows:[headers,row(prior),row(current,'no')]});h.run(extended(content(),study()));h.run(extended(content({pistas:'    Revisión aprobada.'}),study({titulo:'Título revisado'})));
  const c=h.master.sheets.get('Contenido').data;assert.equal(c.length,3);assert.equal(digest(c[1]),digest(row(prior)));assert.equal(c[2][1],'no');assert.equal(c[2][10],current.imagenDiaUrl);assert.equal(c[2][11],current.audioUrl);
  assert.equal(h.privado.sheets.get('Estudios').data.length,2);assert.equal(h.privado.sheets.get('Estudios').data[1][2],'Título revisado');
  h.run({perfil:'pistas-prod-1',dias:[{contenido:content(),vaciarMedios:['imagenDiaUrl']}]});assert.equal(c[2][10],'');assert.equal(c[2][11],current.audioUrl);
});
check('Legacy JSON preserves an omitted study and original reference, then refreshes public export',()=>{
  const h=harness();const a=study({publicar:true});h.run(extended(content(),a));const before=digest(h.privado.sheets.get('Estudios').data);
  h.run([content({pistas:'    Solo cambia la Pista.'})]);assert.equal(digest(h.privado.sheets.get('Estudios').data),before);assert.equal(h.properties['PISTAS_PROD_ORIGINAL_2026-10-27'],ORIGINAL);
  assert.equal(digest(publicData(h)[1][3]),digest(a.contenidoMarkdown));const count=h.mutations.length;
  assert.throws(()=>h.run([content({cita:'Otra cita'})]),/cambia la cita/);assert.equal(h.mutations.length,count);
});
check('Unpublishing clears the old public export BEFORE writing private status',()=>{
  const old=studyRow('2026-10-27','sí','A_ANTES_APROBADA');const h=harness({contentRows:[headers,row()],privateRows:[studyHeaders,old],publicRows:[studyHeaders,old]});h.run(extended(content(),study({publicar:false})));
  assert.equal(publicData(h).slice(1).every(r=>r.every(v=>v==='')),true);assert.equal(h.privado.sheets.get('Estudios').data[1][4],'no');
  const clear=h.events.findIndex(e=>e.type==='clear'&&e.role==='master');const write=h.events.findIndex(e=>e.type==='values'&&e.role==='private'&&e.r>1);assert(clear>=0&&clear<write);
});
check('DST and midnight boundaries use Madrid calendar dates, including repeated autumn hour',()=>{
  const cases=[['2026-10-24T21:59:59Z','2026-10-24',false],['2026-10-24T22:00:00Z','2026-10-25',true],['2026-10-25T00:30:00Z','2026-10-25',true],['2026-10-25T01:30:00Z','2026-10-25',true],['2026-10-25T22:59:59Z','2026-10-25',true],['2026-10-25T23:00:00Z','2026-10-26',true],['2026-03-28T22:59:59Z','2026-03-28',false],['2026-03-28T23:00:00Z','2026-03-29',true],['2026-03-29T01:30:00Z','2026-03-29',true]];
  for(const[now,day,available]of cases){const date=now.includes('-03-')?'2026-03-29':'2026-10-25';const h=harness({now,privateRows:[studyHeaders,studyRow(date)]});h.sync();assert.equal(h.properties.PISTAS_PROD_ULTIMA_EXPORTACION,day);assert.equal(publicData(h).length>1,available);}
});
check('Full-batch validation rejects bad dates, keys, types, profile and formula-like text before clear',()=>{
  const missing=content();delete missing.audioUrl;
  const cases=[[[content(),content({fecha:'2026-02-31'})],/inexistente/],[[content(),content()],/duplicada/],[[content({titulo:123})],/debe ser texto/],[[missing],/falta audioUrl/],[[{...content(),estudioBiblico:{}}],/campo desconocido/],[{perfil:'pistas-lab-1',dias:[]},/desconocido/],[[content({titulo:'=IMPORTDATA("x")'})],/fórmula/],[extended(content(),study({publicar:'sí'})),/booleano/],[extended(content(),study({contenidoMarkdown:'x'.repeat(50001)})),/50.000/],['{INVALIDO}',/JSON no válido/]];
  for(const[input,pattern]of cases){const h=harness({publicRows:[studyHeaders,studyRow()]});rejectWithoutWrites(h,()=>h.run(input),pattern);}
});
check('Header formulas, bad existing field types, duplicates and malformed private publication block all writes',()=>{
  const formula=[];formula[0]=['=CALCULATED_HEADER()'];
  const cases=[[{contentRows:[['WRONG',...headers.slice(1)]]},/Cabecera inesperada/],[{formulas:{master:{Contenido:formula}}},/cabecera.*fórmulas/],[{privateRows:[studyHeaders,studyRow('2026-10-27','TRUE')]},/sí o no/],[{privateRows:[studyHeaders,['2026-10-27','cita',123,'A','sí']]},/debe ser texto/],[{contentRows:[headers,row(),row()]},/duplicada existente/],[{privateRows:[studyHeaders,[...studyRow(),'EXTRA']]},/columnas adicionales/],[{maxRows:{master:{Contenido:1}}},/Amplía las filas/]];
  for(const[options,pattern]of cases){const h=harness(options);rejectWithoutWrites(h,()=>h.run(extended()),pattern);}
});
check('Existing formulas in targeted B/media/study rows are not overwritten by calculated values',()=>{
  for(const column of [1,10,11]){const formulas=[];formulas[1]=[];formulas[1][column]='=VALUE()';const h=harness({contentRows:[headers,row()],formulas:{master:{Contenido:formulas}}});rejectWithoutWrites(h,()=>h.run([content()]),/contiene fórmulas/);}
  const formulas=[];formulas[1]=[];formulas[1][4]='=TRUE()';const h=harness({privateRows:[studyHeaders,studyRow()],formulas:{private:{Estudios:formulas}}});rejectWithoutWrites(h,()=>h.sync(),/fórmulas/);
});
check('Workshop B and known private IDs never enter content, private study text or public export',()=>{
  for(const input of [extended(content(),study({contenidoMarkdown:'## PARTE B. TALLER PARA ELABORAR LAS PISTAS\nInterno'})),extended(content({notasInternas:'B. TALLER PARA PISTAS\nInterno'})),[content({pistas:'    Texto.\n## PARTE B. TALLER PARA ELABORAR LAS PISTAS\nInterno'})],[content({estoyEmpezando:'PARTE B. TALLER PARA PISTAS\nInterno'})],extended(content(),study({contenidoMarkdown:'Original: '+ORIGINAL})),[content({pistas:'    Libro '+PRIVATE})]]){
    const h=harness();rejectWithoutWrites(h,()=>h.run(input),/taller|B\/taller|referencia privada/);
  }
  const h=harness({privateRows:[studyHeaders,studyRow('2026-10-27','sí','Texto '+ORIGINAL)],properties:{'PISTAS_PROD_ORIGINAL_2026-10-27':ORIGINAL}});rejectWithoutWrites(h,()=>h.sync(),/referencia privada/);
});
check('Full 50,000-unit study is stored and exported without truncation',()=>{
  const full='A'.repeat(50000),h=harness();h.run(extended(content(),study({contenidoMarkdown:full,publicar:true})));
  assert.equal(digest(h.privado.sheets.get('Estudios').data[1][3]),digest(full));assert.equal(digest(publicData(h)[1][3]),digest(full));
});
check('All imported cells are text before writing, including C; existing unrelated rows are unformatted',()=>{
  const old=content({fecha:'2026-10-26',titulo:'Lunes, 26 de octubre'}),h=harness({contentRows:[headers,row(old)],simulateTitleDateCoercion:true});h.run(extended());
  const c=h.master.sheets.get('Contenido');assert.equal(c.data[2][2],'Martes, 27 de octubre');assert.equal(typeof c.data[2][2],'string');assert.equal(digest(c.formats[2]),digest(Array(15).fill('@')));assert.equal(c.formats[1],undefined);assert.equal(c.formats[0],undefined);
});
check('A Google Date in existing date column matches the ISO date and is updated without duplication',()=>{
  const previous=row();previous[0]=new Date('2026-10-26T23:00:00Z');const h=harness({contentRows:[headers,previous]});h.run([content()]);assert.equal(h.master.sheets.get('Contenido').data.length,2);assert.equal(h.master.sheets.get('Contenido').data[1][0],'2026-10-27');
});
check('A private write failure leaves public export empty, reports the phase and releases the lock',()=>{
  const old=studyRow('2026-10-27','sí','A_PREVIA'),h=harness({contentRows:[headers,row()],privateRows:[studyHeaders,old],publicRows:[studyHeaders,old],failWrite:'private:Estudios'});
  assert.throws(()=>h.run(extended(content(),study({publicar:false}))),e=>/estudios privados/.test(e.message)&&!e.message.includes('CONTENIDO_PRIVADO_NO_DIVULGAR'));
  assert.equal(publicData(h).slice(1).every(r=>r.every(v=>v==='')),true);assert.equal(JSON.parse(h.properties.PISTAS_PROD_ESTADO).estado,'error');assert.deepEqual(h.stats(),{waits:1,releases:1,triggerCreates:0});assert.equal(allPublic(h).includes(ORIGINAL),false);
});
check('Failures of private references/public export are sanitized and never claim rollback',()=>{
  for(const options of [{failOriginalProperties:true},{failWrite:'master:Estudios'}]){
    const h=harness(options);assert.throws(()=>h.run(extended(content(),study({publicar:true}))),e=>e.message.includes('No se garantiza reversión')&&!e.message.includes('CONTENIDO_PRIVADO_NO_DIVULGAR'));
    assert.equal(allPublic(h).includes(ORIGINAL),false);assert.equal(h.stats().releases,1);
  }
});
check('Sync works without an active UI book, obtains the same ScriptLock and records no A in status',()=>{
  const h=harness({activeId:'NONE',privateRows:[studyHeaders,studyRow()]});h.sync();assert.equal(publicData(h).length,2);assert.equal(h.events[0].type,'lock');const status=JSON.parse(h.properties.PISTAS_PROD_ESTADO);assert.equal(status.fechaMadrid,'2026-10-27');assert.equal(status.estudiosPublicados,1);assert.equal(JSON.stringify(status).includes('A sintética'),false);
});
check('Daily trigger setup needs separate enabling, is idempotent and checks privacy before creation',()=>{
  const off=harness();rejectWithoutWrites(off,()=>off.setup(),/activador desactivada/);
  const on=harness({properties:{PISTAS_PROD_TRIGGERS_ENABLED:'true'}});on.setup();on.setup();assert.equal(on.stats().triggerCreates,1);
  const duplicates=harness({properties:{PISTAS_PROD_TRIGGERS_ENABLED:'true'},triggers:['sincronizarEstudiosPublicados','sincronizarEstudiosPublicados']});rejectWithoutWrites(duplicates,()=>duplicates.setup(),/varios activadores/);
});
check('Failed lock acquisition causes no reads or writes and never releases an unacquired lock',()=>{
  const h=harness({failLock:true});assert.throws(()=>h.sync(),/LOCK_TIMEOUT/);assert.equal(h.mutations.length,0);assert.deepEqual(h.stats(),{waits:0,releases:0,triggerCreates:0});
});

let externalFixtureChecked=false;
if(process.env.PISTAS_TEST_EXEGESIS_PATH){
  const original=await readFile(process.env.PISTAS_TEST_EXEGESIS_PATH,'utf8');
  const match=original.replace(/\r\n/g,'\n').match(/\*\*PARTE A\. ESTUDIO BÍBLICO PUBLICABLE\*\*\s*([\s\S]*?)\s*\*\*FIN DEL ESTUDIO BÍBLICO PUBLICABLE\*\*/);
  assert(match,'External fixture must include complete A delimiters');
  check('External received A is preserved byte-for-byte after LF normalization; A+B is rejected',()=>{
    const a=match[1].trim(),h=harness();h.run(extended(content(),study({contenidoMarkdown:a,publicar:false})));assert.equal(digest(h.privado.sheets.get('Estudios').data[1][3]),digest(a));assert.equal(allPublic(h).includes(a),false);
    const bad=harness();rejectWithoutWrites(bad,()=>bad.run(extended(content(),study({contenidoMarkdown:original}))),/B\/taller/);
  });externalFixtureChecked=true;
}

const result={status:'CANDIDATE PREPARED ONLY',runtime:process.version,sourceSha256:digest(source),checks:results.length,results,
  externalFixtureChecked,networkCalls:0,realGoogleWrites:0,remoteCodeApplied:false,remoteTriggersCreated:0,
  limitations:['Google Apps Script V8, scopes, actual ACL reads and real cross-book writes are not tested here.','No atomic transaction or automatic rollback across books and script properties.','Clear-first export may be temporarily empty after an error; retry import or synchronization after correcting the cause.','ScriptLock coordinates this project only; human edits or other scripts can bypass it.','Workshop detection cannot prove that unlabeled workshop prose is absent.','The daily trigger has an approximate 00:15–00:45 Madrid window; no exact-midnight availability is promised.','DriveApp PRIVATE verifies general sharing access; it does not audit every individually authorized editor.']};
console.log(JSON.stringify(result,null,2));
