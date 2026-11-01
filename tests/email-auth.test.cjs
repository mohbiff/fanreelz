const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFlow,friendlyError,open}=require('../email-auth.js');
function mock(method,result={data:{},error:null}){const calls=[];return {calls,client:{auth:{[method]:async(...args)=>{calls.push(args);return result;}}}};}
test('email login supports arbitrary providers and requires a real session',async()=>{
 for(const domain of ['hotmail.com','outlook.com','yahoo.com','example.org']){
  const m=mock('signInWithPassword',{data:{session:{access_token:'test-session'}},error:null});
  await createFlow(m.client,'https://fanreelz.com').submit('signin',{email:' member@'+domain+' ',password:'test-password'});
  assert.deepEqual(m.calls[0],[{email:'member@'+domain,password:'test-password'}]);
 }
 const m=mock('signInWithPassword');await assert.rejects(createFlow(m.client,'https://fanreelz.com').submit('signin',{email:'a@example.org',password:'test-password'}),/did not finish/);
});
test('signup validates confirmation and consent before calling Supabase',async()=>{
 const m=mock('signUp');const flow=createFlow(m.client,'https://fanreelz.com');
 const valid={email:'a@yahoo.com',password:'long-password',confirm:'long-password',name:'A Fan',terms:true};
 await assert.rejects(flow.submit('signup',{...valid,terms:false}),/accept/);
 await assert.rejects(flow.submit('signup',{...valid,confirm:'different'}),/match/);
 assert.equal(m.calls.length,0);
 await flow.submit('signup',valid);
 assert.deepEqual(m.calls[0],[{email:'a@yahoo.com',password:'long-password',options:{data:{name:'A Fan'},emailRedirectTo:'https://fanreelz.com/?email_auth=confirmed'}}]);
});
test('recovery uses a fixed site redirect and update requires a recovery event',async()=>{
 const m=mock('resetPasswordForEmail');await createFlow(m.client,'https://fanreelz.com').submit('reset',{email:'a@outlook.com'});
 assert.deepEqual(m.calls[0],['a@outlook.com',{redirectTo:'https://fanreelz.com/?email_auth=recovery'}]);
 const u=mock('updateUser');const f=createFlow(u.client,'https://fanreelz.com');const v={password:'new-password',confirm:'new-password'};
 await assert.rejects(f.submit('update',v),/reset link/);assert.equal(u.calls.length,0);
 await f.submit('update',{...v,recovery:true});assert.deepEqual(u.calls[0],[{password:'new-password'}]);
});
test('failed auth never produces a success result and exposes a useful message',async()=>{
 const error={code:'email_not_confirmed',message:'Email not confirmed'};
 const m=mock('signInWithPassword',{error});await assert.rejects(createFlow(m.client,'https://fanreelz.com').submit('signin',{email:'a@example.org',password:'x'}),e=>e===error);
 assert.match(friendlyError(error),/Confirm your email/);
 assert.match(friendlyError({code:'over_email_send_rate_limit'}),/wait/);
});
test('public signup and reset remain gated while SMTP is not configured',()=>{
 for(const mode of ['signup','reset']){let html;open({mode,client:{},show:s=>html=s,origin:'https://fanreelz.com'});assert.match(html,/being set up/);assert.doesNotMatch(html,/<form/);}
});

