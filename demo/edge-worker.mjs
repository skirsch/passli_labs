// Route only demo.passli.app/* to this worker. TLS to the origin is verified.
export default {
  async fetch(request, env) {
    const incoming=new URL(request.url);
    if(incoming.protocol!=='https:') {incoming.protocol='https:';return Response.redirect(incoming.href,308);}
    const upstream=new URL(env.DEMO_UPSTREAM);
    if(upstream.protocol!=='https:')return new Response('HTTPS origin required',{status:503});
    upstream.pathname=upstream.pathname.replace(/\/$/,'')+incoming.pathname;
    upstream.search=incoming.search;
    const headers=new Headers(request.headers);headers.set('Host',upstream.host);
    const response=await fetch(new Request(upstream,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
    const result=new Response(response.body,response);
    result.headers.set('Strict-Transport-Security','max-age=31536000');
    result.headers.set('Cache-Control','no-store');
    return result;
  }
};
