// Real browser regression: compare Live preview pixels with the PDF's capture.
// Runs against a local fixture; never calls an account or generation endpoint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const root = resolve(import.meta.dirname, "..");
const html = await readFile(resolve(root, "index.html"), "utf8");
const fontLink = html.match(/<link\s+href="https:\/\/fonts\.googleapis\.com[\s\S]*?\/>/u)?.[0] || "";
const client = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResumePreview } from '/src/pages/ResumeBuilderPage.jsx';
import { normalizeResumeDraft, normalizeResumeLayout } from '/src/utils/resumeBuilder.js';
import { createResumePdfFromElement } from '/src/utils/resumePdf.js';
import { captureResumeCanvas,createResumeSvg } from '/src/utils/resumeCapture.js';
import { prepareResumeDownload } from '/src/utils/resumeDownload.js';
import '/src/App.css';
const draft=normalizeResumeDraft({
 personal:{fullName:'Avery Sharma',headline:'Information technology',location:'Chennai, Tamil Nadu',email:'avery24@example.com',phone:'9840801856',linkedin:'https://www.linkedin.com/in/avery-r-m-66b34934a',github:'https://github.com/avery123',portfolio:'https://avery-portfolio-website.vercel.app/'},
 summary:'B.Tech Information Technology student and aspiring Frontend Developer specializing in React.js and modern web technologies. Experienced in building responsive web applications and AI-powered projects using React, Node.js and REST APIs.',
 skills:['HTML','CSS','UI/UX Design','React.js','Express.js','SQL'],tools:['Git','Github','VS Code','Figma'],
 projects:[{name:'Symptom analyser',role:'Full-Stack developer',technologies:'React.js, Node.js, Express.js, Groq API.',endDate:'May 2026',link:'https://github.com/avery123/symptom-app',highlights:['Developed a full-stack AI health assistant web app with symptom analysis, vitals tracking, medication management, and an AI doctor chatbot.']},{name:'PrepMatrix AI',role:'Full-Stack Developer',technologies:'React, node.js, Express.js, Groq API, Gemini API',endDate:'May 2026',link:'github.com/avery123/PrepMatrix_AI',highlights:['Built an intelligent study planner that auto-generates personalized timetables, tracks chapter-wise progress, and adapts learning strategies using AI-driven smart suggestions and voice assistance.']}],
 education:[{degree:'B.Tech in Information Technology',institution:'Engineering college',location:'Chennai',score:'7.87/10',startDate:'2024',endDate:'2028'},{degree:'Class XII (CBSE)',institution:'School',location:'Chennai',score:'82.5%',startDate:'2023',endDate:'2024'}],
 certifications:[{name:'AI Agentic foundation',issuer:'Oracle',date:'03/08/2025'},{name:'Python Foundation certification',issuer:'Infosys',date:'23/08/2025'}]
});
const root=createRoot(document.getElementById('fixture'));
let layout;
window.showResume=async(options)=>{
 layout=normalizeResumeLayout({template:'compact',accent:'#334155',...options});
 document.body.style.setProperty('zoom',String(options.zoom),'important');
 document.getElementById('fixture').style.width=(options.width||500)+'px';
 document.getElementById('fixture').style.position=options.offscreen?'fixed':'';
 document.getElementById('fixture').style.left=options.offscreen?'-12000px':'';
 root.render(React.createElement(ResumePreview,{draft,layout}));
 await new Promise(resolve=>setTimeout(resolve,100));
 await document.fonts.ready;
 await new Promise(resolve=>setTimeout(resolve,150));
};
window.exportResume=async()=>{
 const paper=document.querySelector('.resume-paper');
 const nodes=[paper,...paper.querySelectorAll('*')];nodes.forEach((node,i)=>node.setAttribute('data-verify-index',i));
 let png;
 const pdf=await createResumePdfFromElement(document.querySelector('.resume-paper'),draft,layout,{scale:4,
 renderElement:async(element,options)=>{const canvas=await captureResumeCanvas(element,options);png=canvas.toDataURL();return canvas;}});
 const pngExport=await prepareResumeDownload(paper,draft,layout,{format:'png'});
 const pngData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(pngExport.blob);});
 const svg=await createResumeSvg(paper,{width:parseFloat(getComputedStyle(paper).width),height:parseFloat(getComputedStyle(paper).height)});
 const repeated=await captureResumeCanvas(paper,{width:parseFloat(getComputedStyle(paper).width),height:parseFloat(getComputedStyle(paper).height),scale:4});
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-20000px;width:1000px;height:2000px';frame.style.zoom=String(1/(parseFloat(getComputedStyle(document.body).zoom)||1));document.body.append(frame);
 frame.contentDocument.open();frame.contentDocument.write('<html><body style="margin:0">'+svg+'</body></html>');frame.contentDocument.close();await frame.contentDocument.fonts.ready;
 const fontStyle=frame.contentDocument.createElement('style');fontStyle.textContent=[...frame.contentDocument.querySelectorAll('style')].map(n=>n.textContent).join('');frame.contentDocument.head.append(fontStyle);
 await Promise.all([...new Set(nodes.map(n=>getComputedStyle(n).font))].filter(Boolean).map(font=>frame.contentDocument.fonts.load(font)));
 await new Promise(r=>setTimeout(r,100));
 const copied=frame.contentDocument.querySelector('[data-verify-index="0"]');
 const relative=(node,base)=>{const r=node.getBoundingClientRect(),b=base.getBoundingClientRect(),k=parseFloat(getComputedStyle(paper).width)/b.width;return [r.x-b.x,r.y-b.y,r.width,r.height].map(v=>Math.round(v*k*100)/100)};
 const drift=nodes.flatMap(node=>{const other=frame.contentDocument.querySelector('[data-verify-index="'+node.getAttribute('data-verify-index')+'"]');if(!other)return [];const a=relative(node,paper),b=relative(other,copied);return a.some((v,i)=>Math.abs(v-b[i])>.5)?[{tag:node.tagName,txt:node.textContent.slice(0,35),a,b,font:getComputedStyle(node).font,cloneFont:frame.contentWindow.getComputedStyle(other).font}]:[]});
 const wordDrift=[];
 for(const node of nodes){const other=frame.contentDocument.querySelector('[data-verify-index="'+node.getAttribute('data-verify-index')+'"]');if(!other)continue;const t1=[...node.childNodes].filter(n=>n.nodeType===3),t2=[...other.childNodes].filter(n=>n.nodeType===3);for(let i=0;i<t1.length;i++){const text=t1[i].textContent;for(const match of text.matchAll(/\\S+/g)){const wordBox=(textNode,base)=>{const r=textNode.ownerDocument.createRange();r.setStart(textNode,match.index);r.setEnd(textNode,match.index+match[0].length);return relative(r,base)};const a=wordBox(t1[i],paper),b=wordBox(t2[i],copied);if(a.some((v,i)=>Math.abs(v-b[i])>.5))wordDrift.push({text:match[0],a,b});}}}
 const wrappedBadges=nodes.filter(node=>node.matches('.resume-paper__skills span')).flatMap(node=>{
  const range=document.createRange();range.selectNodeContents(node);
  return range.getClientRects().length>1?[node.textContent]:[];
 });
 const capturedBadges=nodes.filter(node=>node.matches('.resume-paper__skills span')).flatMap(node=>{
  const copy=frame.contentDocument?.querySelector('[data-verify-index="'+node.getAttribute('data-verify-index')+'"]');
  if(!copy)return [];
  const range=copy.ownerDocument.createRange();range.selectNodeContents(copy);
  return range.getClientRects().length>1?[node.textContent]:[];
 });
 frame.remove();
 document.getElementById('fixture').style.position='';document.getElementById('fixture').style.left='';
 return {png,pngData,pngType:pngExport.blob.type,pngFilename:pngExport.filename,drift,wordDrift,wrappedBadges,capturedBadges,stable:png===repeated.toDataURL(),pages:pdf.getNumberOfPages(),pdf:pdf.output('datauristring'),fit:document.querySelector('.resume-paper').style.getPropertyValue('--resume-fit-scale')};
};
window.ready=true;
`;
const vite = await createServer({ root, appType: "custom", logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "resume-export-fixture",
    resolveId(id){if(id==='/resume-check-client.js')return '\0resume-check-client';},
    load(id){if(id==='\0resume-check-client')return client;},
    configureServer(server) {
    server.middlewares.use(async (req,res,next)=>{
      if (req.url === "/resume-check") {
        const page=await server.transformIndexHtml(req.url, `<!doctype html><html><head>${fontLink}</head><body style="margin:0;background:white"><div id="fixture"></div><script type="module" src="/resume-check-client.js"></script></body></html>`);
        res.setHeader("Content-Type","text/html");res.end(page);
      } else next();
    });
  }}],
});
await vite.listen();
const browser=await chromium.launch({channel:process.env.RESUME_TEST_BROWSER || (process.platform === 'win32' ? 'msedge' : undefined),headless:true});
try {
  const cases=[{fontFamily:'template',zoom:0.9},{fontFamily:'inter',zoom:1},{fontFamily:'lora',zoom:0.9,template:'signature'},{fontFamily:'manrope',zoom:0.9,width:380,typography:'large',density:'airy'},{fontFamily:'template',zoom:0.9,template:'modern',offscreen:true}];
  for(const options of cases){
    const context=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:4/options.zoom});
    const page=await context.newPage();
    await page.route('**/api/**',()=>{throw new Error('Export test must never call an account API');});
    page.on('pageerror',error=>console.error(error.message));
    await page.goto(vite.resolvedUrls.local[0]+'resume-check');
    await page.waitForFunction(()=>window.ready);
    await page.evaluate(options=>window.showResume(options),options);
    const result=await page.evaluate(()=>window.exportResume());
    assert.deepEqual(result.drift,[], 'Element bounds must match the preview');
    assert.deepEqual(result.wordDrift,[], 'Every word must retain its preview position and width');
    assert.deepEqual(result.wrappedBadges,[], 'Skill and tool labels must stay on one line inside their badges');
    assert.deepEqual(result.capturedBadges,[], 'Exported skill and tool labels must stay on one line inside their badges');
    assert.equal(result.stable,true,'Repeated captures must use the same fonts and pixels');
    assert.equal(result.pngData,result.png,'PDF and PNG export must use identical Live preview pixels');
    assert.equal(result.pngType,'image/png');
    assert.match(result.pngFilename,/-resume\.png$/u);
    assert.equal(result.pages,1);
    assert.ok(Buffer.from(result.pdf.split(',')[1],'base64').subarray(0,5).toString()==='%PDF-');
    const expected=PNG.sync.read(await page.locator('.resume-paper').screenshot());
    const actual=PNG.sync.read(Buffer.from(result.png.split(',')[1],'base64'));
    let difference=0,ink=0,unmatched=0;
    const w=Math.min(actual.width,expected.width),h=Math.min(actual.height,expected.height);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const a=(y*actual.width+x)*4,b=(y*expected.width+x)*4;
      const dark=actual.data[a]<230||expected.data[b]<230;
      if(dark){
        ink++;difference+=Math.abs(actual.data[a]-expected.data[b])/255;
        let best=255;
        for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
          if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
          best=Math.min(best,Math.abs(actual.data[a]-expected.data[((y+dy)*expected.width+x+dx)*4]));
        }
        if(best>50)unmatched++;
      }
    }
    const error=difference/ink;
    console.log(JSON.stringify({options,fit:result.fit,width:actual.width,height:actual.height,expectedWidth:expected.width,expectedHeight:expected.height,inkError:error,unmatchedInk:unmatched/ink}));
    assert.ok(Math.abs(actual.width-expected.width)<=4 && Math.abs(actual.height-expected.height)<=4,'capture dimensions match preview (screenshot rounds to a CSS pixel)');
    // Allow antialiasing within one CSS pixel; shifted/wrapped text fails both
    // the pixel comparison and the independent word geometry checks above.
    assert.ok(unmatched/ink<0.02,`Preview/export unmatched ink ${unmatched/ink} is too large`);
    await context.close();
  }
} finally {await browser.close();await vite.close();}




